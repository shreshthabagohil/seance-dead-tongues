import { useEffect, useRef } from 'react';
import type { ChatMessage } from '../types';
import { ChatBubble } from './ChatBubble';

interface Props {
  messages: ChatMessage[];
  thinking: boolean;
}

export function MessageList({ messages, thinking }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thinking]);

  return (
    <div className="message-list" role="log" aria-live="polite" aria-label="Séance conversation">
      {messages.map((msg) => (
        <ChatBubble key={msg.id} message={msg} />
      ))}
      {thinking && (
        <div className="bubble bubble--ghost bubble--thinking" aria-label="Ghost is thinking">
          <span className="thinking-dots">
            <span>·</span><span>·</span><span>·</span>
          </span>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
