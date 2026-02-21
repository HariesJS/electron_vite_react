import type { ChatMessage } from '../model/types'
import { formatTime } from '../../../shared/lib/formatTime'
import './ChatMessageItem.css'

interface ChatMessageItemProps {
  message: ChatMessage
}

export function ChatMessageItem({ message }: ChatMessageItemProps) {
  return (
    <article className={`message-item message-item_${message.role}`}>
      <p className="message-item__text">{message.content}</p>
      <time className="message-item__time">{formatTime(message.createdAt)}</time>
    </article>
  )
}
