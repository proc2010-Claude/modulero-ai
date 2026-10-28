// Material bought in whole units (MOD-DEC-511): the estimate counts the whole sheets of the cut (508), and the part of a
// sheet left over goes to the maker's stock. The price of the maker can be lower when the maker takes the leftovers of a
// past order instead of a new sheet: the service says it at every line counted so. Now — the sheets of the wardrobe and of
// the sliding wardrobe and the profile bars of the sliding doors (520); the sheets of the kitchen and "other furniture"
// (510) take the note when their estimate counts them whole.

/** The explanation at a line of whole purchase units, by the unit bought. */
export const LEFTOVERS_NOTES = {
  sheet: 'Плита считается целыми листами. Цена у мебельщика может быть ниже, если он возьмёт остатки листов от прошлого заказа, а не купит целый лист.',
  bar: 'Профили считаются целыми хлыстами. Цена у мебельщика может быть ниже, если он возьмёт отрезки из остатков прошлого заказа, а не купит целый хлыст.',
} as const;
