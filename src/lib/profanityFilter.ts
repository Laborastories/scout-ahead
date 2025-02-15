import LeoProfanity from 'leo-profanity'

// Start with the default English dictionary
LeoProfanity.loadDictionary()

// Common letter substitutions used to bypass filters
const substitutions: Record<string, RegExp> = {
  a: /[aA@4∆^]/i,
  b: /[bB8]/i,
  e: /[eE3€&]/i,
  i: /[iI1!lL|]/i,
  o: /[oO0∅θ]/i,
  g: /[gG9]/i,
  s: /[sS$5]/i,
  t: /[tT7+]/i,
  n: /[nNℕ]/i,
  x: /[xX×]/i,
  h: /[hH#]/i,
  w: /[wWωѡ]/i,
  y: /[yY¥]/i,
  v: /[vV∨]/i,
  u: /[uUµ]/i,
  p: /[pP℗]/i,
  r: /[rR®]/i,
  k: /[kK]/i,
  m: /[mM]/i,
  c: /[cC¢©]/i,
  d: /[dDÐ]/i,
  f: /[fF]/i,
  j: /[jJ]/i,
  q: /[qQ]/i,
  z: /[zZ2]/i,
}

// Create regex pattern for a word that handles substitutions
const createPattern = (word: string): RegExp => {
  const pattern = word
    .toLowerCase()
    .split('')
    .map(char => {
      // Look up substitutions using the lowercase character
      const sub = substitutions[char.toLowerCase()]
      if (sub) {
        // Include both the original char and all its substitutions
        const subChars = sub.source.slice(1, -1) // Remove the [] from the RegExp source
        return `[${subChars}]` // Don't need to include char again as it's in subChars
      }
      // If no substitutions, escape special regex characters
      return char.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
    })
    .join('')

  // Use a more flexible pattern that includes optional plural forms and variations
  const finalPattern = `(?:^|[^a-zA-Z0-9])(${pattern}(?:s|es|ing|ed|er)?|${pattern}[^a-zA-Z0-9]*)(?:[^a-zA-Z0-9]|$)`
  console.log(`Created pattern for "${word}": ${finalPattern}`)
  return new RegExp(finalPattern, 'i')
}

// Get all profanity words from the dictionary and create patterns
const dictionaryWords = LeoProfanity.list()
const patterns = dictionaryWords.map(word => ({
  word,
  pattern: createPattern(word),
}))

export interface ProfanityCheckResult {
  isClean: boolean
  hasDiscriminatoryLanguage: boolean
  cleanText: string
}

export const checkText = (text: string): ProfanityCheckResult => {
  // First check with leo-profanity for exact matches
  const leoProfanityResult = LeoProfanity.badWordsUsed(text)

  // Then check for substitution patterns
  const patternMatches = patterns
    .filter(({ pattern }) => pattern.test(text))
    .map(({ word }) => word)

  const detectedWords = [...new Set([...leoProfanityResult, ...patternMatches])]

  return {
    isClean: detectedWords.length === 0,
    hasDiscriminatoryLanguage: detectedWords.length > 0,
    cleanText: detectedWords.length > 0 ? LeoProfanity.clean(text, '*') : text,
  }
}

// Utility function to validate if text is clean
export const isTextClean = (text: string): boolean => {
  return checkText(text).isClean
}
