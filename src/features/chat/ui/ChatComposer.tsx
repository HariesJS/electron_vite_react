import { useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import './ChatComposer.css'

interface ChatComposerProps {
  disabled: boolean
  onSubmit: (text: string) => Promise<void>
}

export function ChatComposer({ disabled, onSubmit }: ChatComposerProps) {
  const [value, setValue] = useState('')

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const text = value.trim()

    if (!text || disabled) {
      return
    }

    setValue('')
    await onSubmit(text)
  }

  const handleKeyDown = async (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      const text = value.trim()

      if (!text || disabled) {
        return
      }

      setValue('')
      await onSubmit(text)
    }
  }

  return (
    <form className="chat-composer" onSubmit={handleSubmit}>
      <textarea
        className="chat-composer__textarea"
        placeholder="Введите сообщение..."
        rows={1}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
      />
      <button className="chat-composer__button" type="submit" disabled={disabled || !value.trim()}>
        Отправить
      </button>
    </form>
  )
}
