import { useCallback, useMemo, useState } from 'react'
import type { ChatMessage } from '../../../shared/types/chat'

const createId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`

const createMessage = (role: ChatMessage['role'], content: string): ChatMessage => ({
  id: createId(),
  role,
  content,
  createdAt: Date.now(),
})

const createWelcomeMessage = (): ChatMessage => {
  return createMessage('assistant', 'Привет. Я на базе Gemini. Напиши сообщение, и я отвечу.')
}

export const useChat = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([createWelcomeMessage()])
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSend = useMemo(() => !isSending, [isSending])

  const sendMessage = useCallback(async (rawText: string) => {
    const content = rawText.trim()

    if (!content || isSending) {
      return
    }

    const userMessage = createMessage('user', content)
    const nextMessages = [...messages, userMessage]

    setMessages(nextMessages)
    setIsSending(true)
    setError(null)

    try {
      if (!window.aiChat || typeof window.aiChat.sendMessage !== 'function') {
        throw new Error('Electron bridge is unavailable. Run the app with `npm run start`.')
      }

      const result = await window.aiChat.sendMessage(nextMessages)
      const assistantMessage = createMessage('assistant', result.text)
      setMessages((prev) => [...prev, assistantMessage])
    } catch (caughtError) {
      const errorMessage = caughtError instanceof Error ? caughtError.message : 'Не удалось получить ответ от Gemini'
      setError(errorMessage)
    } finally {
      setIsSending(false)
    }
  }, [isSending, messages])

  return {
    messages,
    isSending,
    error,
    canSend,
    sendMessage,
  }
}
