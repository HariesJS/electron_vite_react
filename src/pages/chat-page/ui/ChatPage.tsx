import {ChatComposer} from "../../../features/chat/ui/ChatComposer"
import {ChatMessages} from "../../../features/chat/ui/ChatMessages"
import {useChat} from "../../../features/chat/model/useChat"
import "./ChatPage.css"

export function ChatPage() {
    const {messages, isSending, error, canSend, sendMessage} = useChat()

    return (
        <main className="chat-page">
            <section className="chat-page__card">
                <header className="chat-page__header">
                    <h1 className="chat-page__title">HariesAI</h1>
                    <p className="chat-page__subtitle">
                        Gemini chat ElectronJS
                    </p>
                </header>

                <ChatMessages messages={messages} isSending={isSending} />

                {error && <p className="chat-page__error">{error}</p>}

                <ChatComposer disabled={!canSend} onSubmit={sendMessage} />
            </section>
        </main>
    )
}
