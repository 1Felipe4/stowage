/* The solver's number is a conservative PAR, not a ceiling. It buys every
   module at list price and never pawns one back, pays the median fuel price
   everywhere, and wages every hand it thinks the plan needs. Good play beats
   it routinely — so the end screen grades you against it instead of claiming
   it was the most you could have made. */

export function stars(profit: number, par: number): number {
  if (profit <= 0) return 0
  if (par <= 0) return 5 // par said this stage was not worth flying; you flew it
  const r = profit / par
  if (r >= 1) return 5
  if (r >= 0.75) return 4
  if (r >= 0.5) return 3
  if (r >= 0.25) return 2
  return 1
}

export function starLine(n: number): string {
  return '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n)
}

export function verdict(profit: number, par: number): string {
  const n = stars(profit, par)
  if (profit <= 0) return 'You closed the stage down on the books.'
  if (par > 0 && profit > par) return `Above par — ${profit - par} better than the run we plotted.`
  if (n === 5) return 'Par, near enough.'
  if (n === 4) return 'A solid run of it.'
  if (n === 3) return 'Half the money was left in the sector.'
  if (n === 2) return 'Most of the money was left in the sector.'
  return 'Barely worth the fuel.'
}
