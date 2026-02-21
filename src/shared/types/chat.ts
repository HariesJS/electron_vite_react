export type ChatRole = 'user' | 'assistant'

export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  createdAt: number
}

export interface ChatApi {
  sendMessage: (messages: ChatMessage[]) => Promise<{ text: string }>
}
