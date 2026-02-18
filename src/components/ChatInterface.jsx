/**
 * Chat Interface - Agent Communication with Guardrails
 *
 * Security guardrails applied:
 * - Input is validated and sanitized before sending
 * - Rate limiting enforced (UI feedback)
 * - Message length limits displayed
 * - Responses are sanitized before display
 * - Errors shown safely (no internal details)
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, AlertTriangle, RefreshCw, Shield, Lock } from 'lucide-react';
import { AGENT_CONFIGS } from '../utils/agentSecurity.js';
import { sanitizeChatMessage, LIMITS } from '../utils/inputValidation.js';
import { chatRateLimiter } from '../utils/rateLimiter.js';
import { handleError } from '../utils/errorHandler.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { hasPermission, RESOURCES } from '../auth/rbac.js';

const AGENT_COLORS = {
  compliance: 'text-green-400',
  policy: 'text-blue-400',
  audit: 'text-purple-400',
  ethics: 'text-orange-400',
  privacy: 'text-pink-400',
};

function MessageBubble({ message }) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div
        className={`
          max-w-[80%] rounded-2xl px-4 py-3 text-sm
          ${isUser
            ? 'bg-blue-600 text-white rounded-br-md'
            : 'bg-gray-800 text-gray-200 rounded-bl-md border border-gray-700/50'
          }
        `}
      >
        {!isUser && message.agentId && (
          <p className={`text-xs font-medium mb-1 ${AGENT_COLORS[message.agentId] || 'text-gray-400'}`}>
            {AGENT_CONFIGS[message.agentId]?.name || message.agentId}
          </p>
        )}
        {/* Render pre-formatted text safely (content is already sanitized) */}
        <pre className="whitespace-pre-wrap font-sans leading-relaxed">{message.content}</pre>
        <p className="text-xs opacity-50 mt-1 text-right">
          {new Date(message.timestamp).toLocaleTimeString()}
        </p>
      </div>
    </div>
  );
}

function RateLimitWarning({ remaining }) {
  if (remaining > 5) return null;
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-yellow-500/10 border-t border-yellow-500/20 text-yellow-400 text-xs">
      <AlertTriangle className="h-3 w-3" />
      {remaining === 0
        ? 'Rate limit reached. Please wait before sending more messages.'
        : `${remaining} messages remaining before rate limit.`
      }
    </div>
  );
}

export function ChatInterface({ agentId, onSendMessage }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [rateLimitRemaining, setRateLimitRemaining] = useState(30);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const canChat = hasPermission(user, RESOURCES.AGENT_CHAT);
  const config = AGENT_CONFIGS[agentId];

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Welcome message
  useEffect(() => {
    if (config) {
      setMessages([{
        id: 'welcome',
        role: 'agent',
        agentId,
        content: `Hello! I am the ${config.name}. ${config.description}.\n\nHow can I assist you today?`,
        timestamp: new Date().toISOString(),
      }]);
    }
  }, [agentId, config]);

  const handleSend = useCallback(async () => {
    const rawMessage = inputValue.trim();
    if (!rawMessage || isLoading) return;

    // Check rate limit
    const { allowed, remaining } = chatRateLimiter.check(user?.id || 'anonymous');
    setRateLimitRemaining(remaining);

    if (!allowed) {
      setError('Rate limit exceeded. Please wait before sending more messages.');
      return;
    }

    // Sanitize and validate input
    const sanitized = sanitizeChatMessage(rawMessage);
    if (!sanitized) return;

    setError(null);
    setInputValue('');
    setIsLoading(true);

    // Optimistically add user message
    const userMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: sanitized,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);

    try {
      const response = await onSendMessage(agentId, sanitized);

      // Sanitize response content before display
      const safeContent = typeof response?.content === 'string'
        ? response.content.slice(0, 10000) // Cap response length
        : 'Response received.';

      const agentMessage = {
        id: `agent-${Date.now()}`,
        role: 'agent',
        agentId,
        content: safeContent,
        timestamp: response?.timestamp || new Date().toISOString(),
        risk: response?.risk,
      };
      setMessages((prev) => [...prev, agentMessage]);
    } catch (err) {
      const safe = handleError(err, { agentId, messageLength: sanitized.length });
      setError(safe.message);
      // Remove optimistic user message on error
      setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }, [inputValue, isLoading, agentId, user, onSendMessage]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const charCount = inputValue.length;
  const charLimit = LIMITS.CHAT_MESSAGE_MAX_LENGTH;
  const isNearLimit = charCount > charLimit * 0.85;

  if (!config) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500 text-sm">
        Unknown agent: {agentId}
      </div>
    );
  }

  if (!canChat) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-500 text-sm gap-3">
        <Lock className="h-8 w-8 text-gray-600" />
        <p>You do not have permission to chat with agents.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-900 rounded-xl border border-gray-700/50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-700/50 bg-gray-800/50">
        <Shield className="h-4 w-4 text-blue-400" />
        <span className="text-white font-medium text-sm">{config.name}</span>
        <span className="text-gray-500 text-xs ml-auto">
          Encrypted · Audited · Rate-limited
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-1">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {isLoading && (
          <div className="flex justify-start mb-3">
            <div className="bg-gray-800 rounded-2xl rounded-bl-md px-4 py-3 border border-gray-700/50">
              <div className="flex gap-1 items-center">
                <div className="h-2 w-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="h-2 w-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="h-2 w-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg p-3">
            <AlertTriangle className="h-3 w-3 flex-shrink-0" />
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-auto text-red-300 hover:text-red-200">
              <RefreshCw className="h-3 w-3" />
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Rate limit warning */}
      <RateLimitWarning remaining={rateLimitRemaining} />

      {/* Input */}
      <div className="px-4 py-3 border-t border-gray-700/50">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value.slice(0, charLimit))}
              onKeyDown={handleKeyDown}
              placeholder={`Ask the ${config.name}...`}
              rows={1}
              className="
                w-full bg-gray-800 text-gray-200 placeholder-gray-600
                border border-gray-700 rounded-xl px-4 py-2.5 pr-12
                text-sm resize-none focus:outline-none focus:ring-2
                focus:ring-blue-500/50 focus:border-blue-500/50
                transition-colors
              "
              style={{ minHeight: '42px', maxHeight: '120px' }}
              disabled={isLoading || rateLimitRemaining === 0}
            />
            {isNearLimit && (
              <span className={`absolute bottom-2 right-3 text-xs ${charCount >= charLimit ? 'text-red-400' : 'text-yellow-400'}`}>
                {charCount}/{charLimit}
              </span>
            )}
          </div>
          <button
            onClick={handleSend}
            disabled={isLoading || !inputValue.trim() || rateLimitRemaining === 0}
            className="
              bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700
              disabled:cursor-not-allowed text-white p-2.5 rounded-xl
              transition-colors flex-shrink-0 self-end
            "
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
