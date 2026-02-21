import { useEffect, useRef } from 'react'
import type { ChatMessage } from '../../../shared/types/chat'
import { ChatMessageItem } from '../../../entities/message/ui/ChatMessageItem'
import './ChatMessages.css'

interface ChatMessagesProps {
  messages: ChatMessage[]
  isSending: boolean
}

export function ChatMessages({ messages, isSending }: ChatMessagesProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const container = containerRef.current

    if (!container) {
      return
    }

    container.scrollTop = container.scrollHeight
  }, [messages, isSending])

  return (
    <section className="chat-messages" ref={containerRef}>
      {messages.map((message) => (
        <ChatMessageItem key={message.id} message={message} />
      ))}
      {isSending && <div className="chat-messages__typing">Gemini печатает...</div>}
    </section>
  )
}
