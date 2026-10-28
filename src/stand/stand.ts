// Стенд ИИ-диалога (TASK_FIRST.md п. 1–3): выполняет инструменты tools.claude-api.json и расширения 0.2 (AI-DEC-007) функциями ядра
// modulero-next и ведёт сеанс на диске. Ответ правок — EXCHANGE_SPEC.md §5.
//
// sessions/<имя>/
//   session.json         история версий с подписями, текущая версия, варианты (черновик ядра)
//   versions/NNN.modulero файл проекта каждой версии (открывается в конструкторе)
//   versions/NNN.svg      превью версии (previewSvg ядра)
//   calls.jsonl          журнал вызовов и ответов
//   dialog.jsonl         текст диалога: реплики человека и ИИ, кнопки
//   usage.json           оценка расхода Claude API по ходам (cost.ts, AI-DEC-006)
//   prototype.html       страница прототипа, переписывается после каждого вызова и реплики
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadStandTools } from '../tools.ts';
import { commandList, loadCommands, runCommand, type CommandsFile } from './commands.ts';
import { sessionCost, type SessionCost } from './cost.ts';
import type { Core } from './engine.ts';
import { applyKitchenEdit, kitchenOptions, kitchenView, startKitchen, type Edit, type EditResult, type KitchenProject, type KitchenView } from './kitchen.ts';
import { applyHomeEdit, homeOptions, homeView, startHome, type HomeProject, type HomeView } from './home.ts';
import { renderPage } from './page.ts';
import { validate } from './validate.ts';
import { applyWardrobeEdit, graphChecked, startWardrobe, wardrobeFileKind, wardrobeOptions, wardrobeView, type WardrobeInput, type WardrobeView } from './wardrobe.ts';

export const SESSION_FORMAT = 'modulero-ai.session/1';
export const APP_VERSION = 'modulero-ai-stand';

export interface Version {
  n: number;
  revision: string;
  label: string;
  tool: string;
  file: string;
  at: string;
  price: { status: string; amount_rub: number | null; known_amount_rub: number | null };
}

export interface SessionData {
  format: typeof SESSION_FORMAT;
  name: string;
  created: string;
  engine: { repo: string; sha: string; hardwareCatalog: string };
  /** Изделие текущей версии: кухня, распашной шкаф, купе (купе ↔ шкаф меняет правка set_product) или другая мебель. */
  kind: ProductKind | null;
  /** Номер текущей версии в history (n). */
  head: number | null;
  history: Version[];
  /** Черновик ядра с вариантами (kitchen/draft.ts), текст draftText. */
  draft: string | null;
  /** Сквозной номер записей calls.jsonl и dialog.jsonl: порядок вызовов и реплик. */
  seq: number;
}

export interface DialogLine {
  seq?: number;
  at: string;
  who: 'human' | 'ai' | 'choices';
  text: string;
  options?: string[];
}

export type Output = Record<string, unknown>;
export type ProductKind = 'kitchen' | 'wardrobe' | 'sliding' | 'home';
/** Проект версии: KitchenProject кухни, WardrobeInput шкафа или HomeProject другой мебели. */
export type Project = KitchenProject | WardrobeInput | HomeProject;
export type ProductView = KitchenView | WardrobeView | HomeView;

const KINDS: readonly string[] = ['kitchen', 'wardrobe', 'sliding', 'home'];
const isWardrobe = (kind: string | null) => kind === 'wardrobe' || kind === 'sliding';
/** Редактор изделия: у распашного шкафа и купе он один. */
const family = (kind: string | null) => (isWardrobe(kind) ? 'wardrobe' : kind);
const EDITS_TOOL: Record<string, string> = { kitchen: 'kitchen_edits', wardrobe: 'wardrobe_edits', home: 'home_edits' };
const PRODUCT_OF_TOOL: Record<string, string> = { kitchen_edits: 'кухня', wardrobe_edits: 'шкаф', home_edits: 'другая мебель' };

/** Ошибка вызова (§5 п. 5): ИИ извиняется одним предложением и предлагает повторить. */
const error = (text: string): Output => ({ error: text, is_error: true });

export class Stand {
  readonly dir: string;
  data: SessionData;
  private project: Project | null = null;
  private view: ProductView | null = null;
  private readonly schemas = new Map(loadStandTools().tools.map((t) => [t.name, t.input_schema]));
  private readonly commands: CommandsFile;

  private readonly core: Core;
  readonly name: string;
  private readonly clock: () => Date;

  constructor(core: Core, root: string, name: string, clock: () => Date = () => new Date()) {
    this.core = core;
    this.commands = loadCommands(core.pin.sha);
    this.name = name;
    this.clock = clock;
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(name)) throw new Error(`Имя сеанса — латиница в нижнем регистре, цифры и «-»: ${name}`);
    this.dir = join(root, name);
    const file = join(this.dir, 'session.json');
    if (existsSync(file)) {
      this.data = JSON.parse(readFileSync(file, 'utf8'));
      if (this.data.format !== SESSION_FORMAT) throw new Error(`Сеанс ${name}: формат ${this.data.format}`);
      if (this.data.engine.sha !== core.pin.sha) throw new Error(`Сеанс ${name} начат на ядре ${this.data.engine.sha.slice(0, 8)}, стенд — на ${core.pin.sha.slice(0, 8)}.`);
    } else {
      mkdirSync(join(this.dir, 'versions'), { recursive: true });
      this.data = {
        format: SESSION_FORMAT,
        name,
        created: this.clock().toISOString(),
        engine: { repo: core.pin.repo, sha: core.pin.sha, hardwareCatalog: core.pin.hardwareCatalog },
        kind: null,
        head: null,
        history: [],
        draft: null,
        seq: 0,
      };
      this.save();
    }
  }

  get projectId(): string {
    return this.name;
  }

  /** Выполнить инструмент; ответ пишется в журнал, страница прототипа переписывается. */
  run(tool: string, input: unknown): Output {
    let out: Output;
    try {
      out = this.dispatch(tool, input);
    } catch (e) {
      out = error(`Сбой стенда: ${e instanceof Error ? e.message : String(e)}`);
    }
    appendFileSync(join(this.dir, 'calls.jsonl'), JSON.stringify({ seq: this.next(), at: this.clock().toISOString(), tool, input, output: out }) + '\n');
    this.renderPage();
    return out;
  }

  /** Реплика диалога в ленту страницы. */
  say(who: 'human' | 'ai', text: string): void {
    this.addLine({ at: this.clock().toISOString(), who, text });
  }

  private addLine(line: DialogLine) {
    appendFileSync(join(this.dir, 'dialog.jsonl'), JSON.stringify({ seq: this.next(), ...line }) + '\n');
    this.renderPage();
  }

  private next(): number {
    this.data.seq += 1;
    this.save();
    return this.data.seq;
  }

  /** Записи журнала вызовов. */
  calls(): { seq: number; at: string; tool: string; input: unknown; output: Output }[] {
    const f = join(this.dir, 'calls.jsonl');
    return existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  }

  private dispatch(tool: string, input: unknown): Output {
    const schema = this.schemas.get(tool);
    if (!schema) return error(`Нет инструмента «${tool}». Есть: ${[...this.schemas.keys()].join(', ')}.`);
    const problems = validate(schema, input);
    if (problems.length) return error(`Вход ${tool} не по схеме: ${problems.slice(0, 5).join('; ')}`);
    const a = input as Record<string, any>;
    switch (tool) {
      case 'start_project':
        return this.start(a.kind, a.template);
      case 'get_options':
        return this.options(a.kind, a.topic);
      case 'kitchen_edits':
      case 'wardrobe_edits':
      case 'home_edits':
      case 'editor_call':
        return this.edits(tool, a);
      case 'list_commands':
        return { kind: a.kind, commands: commandList(this.commands, a.kind) };
      case 'get_project':
        return this.withProject(a.project_id, () => this.projectAnswer());
      case 'undo':
        return this.withProject(a.project_id, () => this.undo(a.to_revision));
      case 'variants':
        return this.withProject(a.project_id, () => this.variants(a.action, a.name));
      case 'offer_choices':
        this.addLine({ at: this.clock().toISOString(), who: 'choices', text: '', options: a.options });
        return { shown: a.options, allow_free_text: a.allow_free_text };
      case 'open_in_editor':
        return this.withProject(a.project_id, () => {
          const v = this.headVersion()!;
          return { project_id: this.projectId, revision: v.revision, file: join(this.dir, v.file), how: 'Файл проекта Modulero: в конструкторе «Открыть проект» и выбрать этот файл.' };
        });
    }
    return error(`Инструмент «${tool}» на стенде не выполняется.`);
  }

  // ------------------------------------------------------------ проект и версии

  private start(kind: string, template: string | null): Output {
    if (isWardrobe(kind) && template !== null && template !== 'start') return error(`Шаблон «${template}» — не для шкафа: у шкафа и купе один стартовый, start.`);
    const r = kind === 'kitchen' ? startKitchen(this.core, template) : kind === 'home' ? startHome(this.core, template) : startWardrobe(this.core, kind as 'wardrobe' | 'sliding');
    if (!r.ok) return { project_id: this.projectId, refused: { problem: r.problem } };
    this.data.kind = kind as ProductKind;
    this.data.draft = null;
    const label =
      kind === 'kitchen'
        ? template && template !== 'empty'
          ? `Новая кухня: пример «${template}»`
          : 'Новая кухня'
        : kind === 'home'
          ? `Новая мебель: ${(r.project as HomeProject).name}`
          : kind === 'sliding'
            ? 'Новый шкаф-купе'
            : 'Новый распашной шкаф';
    const v = this.commit(r.project, label, 'start_project');
    return { project_id: this.projectId, revision: v.revision, notice: r.notice ?? null, ...this.summary() };
  }

  private edits(tool: string, a: Record<string, any>): Output {
    return this.withProject(a.project_id, () => {
      const kind = this.data.kind!,
        own = EDITS_TOOL[family(kind)!]!;
      if (tool !== 'editor_call' && tool !== own) return error(`Проект — ${PRODUCT_OF_TOOL[own]}, а ${tool} — правки для изделия «${PRODUCT_OF_TOOL[tool]}»: здесь ${own} или editor_call.`);
      const wardrobe = isWardrobe(kind);
      // editor_call: команда редактора по имени (commands.ts); у шкафа после неё, как после правки договора, строится граф.
      const items: Edit[] = tool === 'editor_call' ? a.calls.map((c: { command: string; args_json: string }) => ({ op: c.command, args_json: c.args_json })) : a.edits;
      const apply = (p: Project, e: Edit): EditResult => {
        if (tool === 'editor_call') {
          const r = runCommand(this.core, this.commands, kind, p, e.op, e.args_json as string);
          return wardrobe ? graphChecked(this.core, r) : r;
        }
        return wardrobe ? applyWardrobeEdit(this.core, p, e) : kind === 'home' ? applyHomeEdit(this.core, this.commands, p, e) : applyKitchenEdit(this.core, p, e);
      };
      const head = this.headVersion()!;
      if (a.base_revision !== head.revision)
        return {
          project_id: this.projectId,
          revision: head.revision,
          applied: [],
          refused: { i: null, op: null, code: 'STALE_REVISION', problem: `Проект уже в версии ${head.revision}, правка от ${a.base_revision}. Правки не применены.` },
          not_run: items.map((_: unknown, i: number) => i),
          ...this.summary(),
        };
      let p = this.current();
      const applied: { i: number; op: string; notice: string | null }[] = [];
      let refused: { i: number; op: string; problem: string } | null = null;
      for (const [i, e] of items.entries()) {
        const r = apply(p, e);
        if (!r.ok) {
          refused = { i, op: e.op, problem: r.problem };
          break;
        }
        p = r.project;
        applied.push({ i, op: e.op, notice: r.notice ?? null });
      }
      const notRun = refused ? items.map((_, i) => i).filter((i) => i > refused!.i) : [];
      const before = head.revision;
      if (applied.length) this.commit(p, a.label, tool);
      const now = this.headVersion()!;
      return { project_id: this.projectId, revision: now.revision, previous_revision: before, version: now.n, applied, refused, not_run: notRun, ...this.summary() };
    });
  }

  private undo(to: string): Output {
    const v = [...this.data.history].reverse().find((x) => x.revision === to);
    if (!v) return { project_id: this.projectId, refused: { problem: `Версии ${to} нет в истории.` }, history: this.historyList() };
    const before = this.headVersion()!.revision;
    const { kind, project: p } = this.readVersion(v);
    // Версия могла быть другим изделием (новый start_project в том же сеансе): возврат — к ней целиком.
    if (family(kind) !== family(this.data.kind)) this.data.draft = null;
    this.data.kind = kind;
    const now = this.commit(p, `Возврат к версии ${v.n} «${v.label}»`, 'undo');
    return { project_id: this.projectId, revision: now.revision, previous_revision: before, version: now.n, ...this.summary() };
  }

  /** Черновик ядра с вариантами — у каждого изделия свой: kitchen/draft.ts, wardrobe/draft.ts, home/draft.ts. */
  private get drafts(): any {
    const { core } = this;
    if (isWardrobe(this.data.kind)) return core.WD;
    if (this.data.kind !== 'home') return core.K.draft;
    // У HOME чтение черновика проверяет проекты вариантов каталогом выпуска.
    return { ...core.H.draft, readDraft: (text: string | null) => core.H.draft.readDraft(text, core.HW) };
  }

  private viewOf(p: Project): ProductView {
    const kind = this.data.kind;
    return isWardrobe(kind) ? wardrobeView(this.core, p) : kind === 'home' ? homeView(this.core, p) : kitchenView(this.core, p);
  }

  private variants(action: 'save' | 'list' | 'switch', name: string | null): Output {
    const D = this.drafts;
    let d = D.readDraft(this.data.draft) ?? D.newDraft(this.current());
    const list = () =>
      d.variants.map((v: any) => {
        const view = this.viewOf(v.input);
        return { name: v.name, active: v.id === d.active, revision: view.revision, price: priceLine(view.price) };
      });
    if (action === 'list') return { project_id: this.projectId, variants: list() };
    if (!name) return { project_id: this.projectId, refused: { problem: 'Нужно имя варианта.' } };
    if (action === 'save') {
      // Текущее состояние остаётся вариантом с этим именем; дальше правится его копия.
      const renamed = D.renameVariant(d, d.active, name);
      if (!renamed.ok) return { project_id: this.projectId, refused: { problem: renamed.problem } };
      const added = D.addVariant(renamed.draft);
      if (!added.ok) return { project_id: this.projectId, refused: { problem: added.problem } };
      d = added.draft;
      this.data.draft = D.draftText(d);
      this.save();
      return { project_id: this.projectId, notice: `Вариант «${name.trim()}» сохранён; дальше правится его копия «${D.activeVariant(d).name}».`, variants: list() };
    }
    const target = d.variants.find((v: any) => v.name.toLowerCase() === name.trim().toLowerCase());
    if (!target) return { project_id: this.projectId, refused: { problem: `Варианта «${name}» нет.` }, variants: list() };
    const selected = D.selectVariant(d, target.id);
    if (!selected.ok) return { project_id: this.projectId, refused: { problem: selected.problem } };
    this.data.draft = D.draftText(selected.draft);
    const before = this.headVersion()!.revision;
    const now = this.commit(target.input, `Вариант «${target.name}»`, 'variants');
    return { project_id: this.projectId, revision: now.revision, previous_revision: before, version: now.n, ...this.summary(), variants: list() };
  }

  private withProject(id: string, fn: () => Output): Output {
    if (this.data.head === null) return error('Проекта ещё нет: сначала start_project.');
    if (id !== this.projectId) return error(`Нет проекта ${id}; в этом сеансе — ${this.projectId}.`);
    return fn();
  }

  /** Новая версия: файл проекта, превью, запись истории; варианты получают текущий проект. */
  private commit(p: Project, label: string, tool: string): Version {
    const { core } = this;
    if (isWardrobe(this.data.kind)) this.data.kind = wardrobeFileKind(p);
    const view = this.viewOf(p);
    const n = (this.data.history.at(-1)?.n ?? 0) + 1,
      file = `versions/${String(n).padStart(3, '0')}.modulero`;
    // Файл проекта — как его пишет конструктор: кухня — KitchenProject, шкаф — WardrobeProject (вход и чем посчитан).
    const saved = 'graph' in view ? core.wardrobeProject(p, core.HW, view.graph) : p;
    writeFileSync(join(this.dir, file), core.writeProjectFile(this.data.kind!, saved, { appVersion: APP_VERSION, now: this.clock(), hardwareCatalog: core.HW.release }));
    if (view.previewSvg) writeFileSync(join(this.dir, file.replace(/\.modulero$/, '.svg')), view.previewSvg);
    const v: Version = { n, revision: view.revision, label, tool, file, at: this.clock().toISOString(), price: priceLine(view.price) };
    this.data.history.push(v);
    this.data.head = n;
    if (this.data.draft) {
      const D = this.drafts;
      const d = D.readDraft(this.data.draft);
      if (d) this.data.draft = D.draftText(D.withInput(d, p));
    }
    this.project = p;
    this.view = view;
    this.save();
    return v;
  }

  /** Ревизия текущей версии сеанса; null — проекта ещё нет. */
  headRevision(): string | null {
    return this.headVersion()?.revision ?? null;
  }

  private headVersion(): Version | null {
    return this.data.history.find((v) => v.n === this.data.head) ?? null;
  }

  /** Проект версии читается из её файла (readProjectFile ядра): так проверяется, что файл открывается в конструкторе. */
  private readVersion(v: Version): { kind: ProductKind; project: Project } {
    const opened = this.core.readProjectFile(readFileSync(join(this.dir, v.file), 'utf8'), this.core.HW);
    if (!KINDS.includes(opened.kind) || !opened.editable) throw new Error(`Файл ${v.file} не открывается для правки: ${opened.kind}.`);
    return { kind: opened.kind, project: isWardrobe(opened.kind) ? (opened.project.input as WardrobeInput) : (opened.project as KitchenProject | HomeProject) };
  }

  current(): Project {
    if (!this.project) this.project = this.readVersion(this.headVersion()!).project;
    return this.project;
  }

  currentView(): ProductView | null {
    if (this.data.head === null) return null;
    if (!this.view) this.view = this.viewOf(this.current());
    return this.view;
  }

  private summary(): Output {
    const view = this.currentView()!;
    return {
      state: view.state,
      price: view.price,
      warnings: view.warnings,
      view: { page: join(this.dir, 'prototype.html'), preview_svg: view.previewSvg ? join(this.dir, this.headVersion()!.file.replace(/\.modulero$/, '.svg')) : null },
    };
  }

  private projectAnswer(): Output {
    const v = this.headVersion()!;
    return { project_id: this.projectId, revision: v.revision, version: v.n, ...this.summary(), history: this.historyList() };
  }

  historyList() {
    return this.data.history.map((v) => ({ n: v.n, revision: v.revision, label: v.label, price: v.price, current: v.n === this.data.head }));
  }

  private options(kind: string, topic: string): Output {
    const values = kind === 'kitchen' ? kitchenOptions(this.core, topic) : kind === 'home' ? homeOptions(this.core, topic) : wardrobeOptions(this.core, kind as 'wardrobe' | 'sliding', topic);
    const what = kind === 'kitchen' ? 'к кухне' : kind === 'home' ? 'к другой мебели' : kind === 'sliding' ? 'к шкафу-купе' : 'к распашному шкафу';
    return values === null ? error(`Тема «${topic}» ${what} не относится или на стенде её пока нет.`) : { kind, topic, values };
  }

  // ------------------------------------------------------------ диск

  private save() {
    writeFileSync(join(this.dir, 'session.json'), JSON.stringify(this.data, null, 2) + '\n');
  }

  dialog(): DialogLine[] {
    const f = join(this.dir, 'dialog.jsonl');
    return existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  }

  /** Оценка расхода Claude API, если бы этот диалог шёл через API (AI-DEC-006). */
  cost(): SessionCost {
    const events = [
      ...this.dialog().filter((d) => d.who !== 'choices').map((d) => ({ seq: d.seq ?? 0, e: { kind: d.who as 'human' | 'ai', text: d.text } })),
      ...this.calls().map((c) => ({ seq: c.seq, e: { kind: 'call' as const, tool: c.tool, input: c.input, output: c.output } })),
    ].sort((a, b) => a.seq - b.seq);
    return sessionCost(events.map((x) => x.e));
  }

  renderPage() {
    const cost = this.cost();
    writeFileSync(join(this.dir, 'usage.json'), JSON.stringify(cost, null, 2) + '\n');
    writeFileSync(join(this.dir, 'prototype.html'), renderPage(this, cost));
  }
}

export function priceLine(price: Record<string, unknown>): Version['price'] {
  return { status: String(price.status), amount_rub: price.amount_rub as number | null, known_amount_rub: price.known_amount_rub as number | null };
}

