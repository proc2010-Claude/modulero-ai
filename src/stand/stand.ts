// Стенд ИИ-диалога (TASK_FIRST.md п. 1–3): выполняет инструменты tools.claude-api.json функциями ядра
// modulero-next и ведёт сеанс на диске. Ответ правок — EXCHANGE_SPEC.md §5.
//
// sessions/<имя>/
//   session.json         история версий с подписями, текущая версия, варианты (черновик ядра)
//   versions/NNN.modulero файл проекта каждой версии (открывается в конструкторе)
//   versions/NNN.svg      превью версии (previewSvg ядра)
//   calls.jsonl          журнал вызовов и ответов
//   dialog.jsonl         текст диалога: реплики человека и ИИ, кнопки
//   prototype.html       страница прототипа, переписывается после каждого вызова и реплики
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadTools } from '../tools.ts';
import type { Core } from './engine.ts';
import { applyKitchenEdit, kitchenOptions, kitchenView, startKitchen, type Edit, type KitchenProject, type KitchenView } from './kitchen.ts';
import { renderPage } from './page.ts';
import { validate } from './validate.ts';

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
  kind: 'kitchen' | null;
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

const NOT_YET = 'На стенде пока только кухня (этап 1). Шкаф, купе и другая мебель — этап 2.';

/** Ошибка вызова (§5 п. 5): ИИ извиняется одним предложением и предлагает повторить. */
const error = (text: string): Output => ({ error: text, is_error: true });

export class Stand {
  readonly dir: string;
  data: SessionData;
  private project: KitchenProject | null = null;
  private view: KitchenView | null = null;
  private readonly schemas = new Map(loadTools().tools.map((t) => [t.name, t.input_schema]));

  private readonly core: Core;
  readonly name: string;
  private readonly clock: () => Date;

  constructor(core: Core, root: string, name: string, clock: () => Date = () => new Date()) {
    this.core = core;
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
        return this.edits(a);
      case 'wardrobe_edits':
      case 'home_edits':
        return error(NOT_YET);
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
    if (kind !== 'kitchen') return error(NOT_YET);
    const r = startKitchen(this.core, template);
    if (!r.ok) return { project_id: this.projectId, refused: { problem: r.problem } };
    this.data.kind = 'kitchen';
    this.data.draft = null;
    const v = this.commit(r.project, template && template !== 'empty' ? `Новая кухня: пример «${template}»` : 'Новая кухня', 'start_project');
    return { project_id: this.projectId, revision: v.revision, notice: r.notice ?? null, ...this.summary() };
  }

  private edits(a: Record<string, any>): Output {
    return this.withProject(a.project_id, () => {
      const head = this.headVersion()!;
      if (a.base_revision !== head.revision)
        return {
          project_id: this.projectId,
          revision: head.revision,
          applied: [],
          refused: { i: null, op: null, code: 'STALE_REVISION', problem: `Проект уже в версии ${head.revision}, правка от ${a.base_revision}. Правки не применены.` },
          not_run: a.edits.map((_: unknown, i: number) => i),
          ...this.summary(),
        };
      let p = this.current();
      const applied: { i: number; op: string; notice: string | null }[] = [];
      let refused: { i: number; op: string; problem: string } | null = null;
      for (const [i, e] of (a.edits as Edit[]).entries()) {
        const r = applyKitchenEdit(this.core, p, e);
        if (!r.ok) {
          refused = { i, op: e.op, problem: r.problem };
          break;
        }
        p = r.project;
        applied.push({ i, op: e.op, notice: r.notice ?? null });
      }
      const notRun = refused ? (a.edits as Edit[]).map((_, i) => i).filter((i) => i > refused!.i) : [];
      const before = head.revision;
      if (applied.length) this.commit(p, a.label, 'kitchen_edits');
      const now = this.headVersion()!;
      return { project_id: this.projectId, revision: now.revision, previous_revision: before, version: now.n, applied, refused, not_run: notRun, ...this.summary() };
    });
  }

  private undo(to: string): Output {
    const v = [...this.data.history].reverse().find((x) => x.revision === to);
    if (!v) return { project_id: this.projectId, refused: { problem: `Версии ${to} нет в истории.` }, history: this.historyList() };
    const before = this.headVersion()!.revision;
    const p = this.readVersion(v);
    const now = this.commit(p, `Возврат к версии ${v.n} «${v.label}»`, 'undo');
    return { project_id: this.projectId, revision: now.revision, previous_revision: before, version: now.n, ...this.summary() };
  }

  private variants(action: 'save' | 'list' | 'switch', name: string | null): Output {
    const D = this.core.K.draft;
    let d = D.readDraft(this.data.draft) ?? D.newDraft(this.current());
    const list = () =>
      d.variants.map((v: any) => {
        const view = kitchenView(this.core, v.input);
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
  private commit(p: KitchenProject, label: string, tool: string): Version {
    const { core } = this;
    const view = kitchenView(core, p);
    const n = (this.data.history.at(-1)?.n ?? 0) + 1,
      file = `versions/${String(n).padStart(3, '0')}.modulero`;
    writeFileSync(join(this.dir, file), core.writeProjectFile('kitchen', p, { appVersion: APP_VERSION, now: this.clock(), hardwareCatalog: core.HW.release }));
    if (view.previewSvg) writeFileSync(join(this.dir, file.replace(/\.modulero$/, '.svg')), view.previewSvg);
    const v: Version = { n, revision: view.revision, label, tool, file, at: this.clock().toISOString(), price: priceLine(view.price) };
    this.data.history.push(v);
    this.data.head = n;
    if (this.data.draft) {
      const D = core.K.draft;
      const d = D.readDraft(this.data.draft);
      if (d) this.data.draft = D.draftText(D.withInput(d, p));
    }
    this.project = p;
    this.view = view;
    this.save();
    return v;
  }

  private headVersion(): Version | null {
    return this.data.history.find((v) => v.n === this.data.head) ?? null;
  }

  /** Проект версии читается из её файла (readProjectFile ядра): так проверяется, что файл открывается в конструкторе. */
  private readVersion(v: Version): KitchenProject {
    const opened = this.core.readProjectFile(readFileSync(join(this.dir, v.file), 'utf8'), this.core.HW);
    if (opened.kind !== 'kitchen' || !opened.editable) throw new Error(`Файл ${v.file} не открывается как кухня.`);
    return opened.project as KitchenProject;
  }

  current(): KitchenProject {
    if (!this.project) this.project = this.readVersion(this.headVersion()!);
    return this.project;
  }

  currentView(): KitchenView | null {
    if (this.data.head === null) return null;
    if (!this.view) this.view = kitchenView(this.core, this.current());
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
    if (kind !== 'kitchen') return error(NOT_YET);
    const values = kitchenOptions(this.core, topic);
    return values === null ? error(`Тема «${topic}» к кухне не относится или на стенде её пока нет.`) : { kind, topic, values };
  }

  // ------------------------------------------------------------ диск

  private save() {
    writeFileSync(join(this.dir, 'session.json'), JSON.stringify(this.data, null, 2) + '\n');
  }

  dialog(): DialogLine[] {
    const f = join(this.dir, 'dialog.jsonl');
    return existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  }

  private renderPage() {
    writeFileSync(join(this.dir, 'prototype.html'), renderPage(this));
  }
}

export function priceLine(price: Record<string, unknown>): Version['price'] {
  return { status: String(price.status), amount_rub: price.amount_rub as number | null, known_amount_rub: price.known_amount_rub as number | null };
}

