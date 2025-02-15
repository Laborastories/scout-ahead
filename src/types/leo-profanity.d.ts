declare module 'leo-profanity' {
  export interface LeoProfanity {
    check: (text: string) => boolean
    clean: (text: string, replaceKey?: string, nbLetters?: number) => string
    add: (data: string | string[]) => void
    clearList: () => void
    list: () => string[]
    removeWord: (word: string) => void
    remove: (data: string | string[]) => void
    reset: () => void
    loadDictionary: (name?: string) => void
    getDictionary: (name?: string) => string[]
    badWordsUsed: (str: string) => string[]
  }

  const profanity: LeoProfanity
  export default profanity
}
