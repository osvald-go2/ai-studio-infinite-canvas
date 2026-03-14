import React, { useState, useRef, useEffect } from 'react';
import { X, Clock, Plus, MessageSquare, Send, Copy, ThumbsUp, ThumbsDown, ArrowUp, Square, Minus, Check, Pencil } from 'lucide-react';
import { Session, Message } from '../types';
import { generateMockDiff } from '../services/mockGit';

const MOCK_RESPONSES = [
  "好的，我来帮你分析一下这个问题。\n\n首先，我们需要理解整体架构。这个项目使用了 React 19 + TypeScript + Vite 的技术栈，采用组件化设计，状态通过 props 从 App.tsx 向下传递。\n\n主要的改动点包括：\n1. 修改组件的 props 接口\n2. 添加新的状态管理逻辑\n3. 更新样式以匹配设计稿\n\n让我开始实现这些变更。",
  "我已经检查了代码库，发现了几个关键文件：\n\n```typescript\n// src/types.ts\nexport interface Session {\n  id: string;\n  title: string;\n  model: string;\n  status: SessionStatus;\n  messages: Message[];\n}\n```\n\n这个接口定义了 Session 的核心结构。我建议我们在此基础上扩展，添加必要的字段。\n\n接下来我会修改相关组件，确保类型安全和向后兼容。所有改动都经过了 TypeScript 类型检查。",
  "任务完成！以下是本次修改的摘要：\n\n**修改的文件：**\n- `src/components/SessionWindow.tsx` — 添加了新功能\n- `src/types.ts` — 更新了类型定义\n\n**新增功能：**\n- 支持内联编辑\n- 自动保存机制\n- 键盘快捷键支持（Enter 保存，Escape 取消）\n\n**测试建议：**\n1. 验证编辑功能在各个视图模式下正常工作\n2. 测试边界情况（空字符串、超长文本）\n3. 确认拖拽交互不受影响\n\n如果有任何问题，随时告诉我！"
];

export function SessionWindow({ 
  session, 
  onUpdate, 
  onClose, 
  onOpenReview,
  fullScreen = false
}: { 
  session: Session, 
  onUpdate: (s: Session) => void, 
  onClose?: () => void, 
  onOpenReview?: () => void,
  fullScreen?: boolean
}) {
  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState('');

  const isStreamingRef = useRef(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef(session);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const scrollToBottom = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [session.messages, isStreaming]);

  useEffect(() => {
    // Auto-trigger AI response if the session was just created with an initial prompt
    if (session.messages.length === 1 && session.messages[0].role === 'user' && !isStreamingRef.current) {
      const triggerInitialResponse = async () => {
        const aiMsgId = (Date.now() + 1).toString();
        const aiMsg: Message = {
          id: aiMsgId,
          role: 'assistant',
          content: '',
          type: 'text'
        };

        const updatedMessages = [...session.messages, aiMsg];
        
        onUpdate({
          ...session,
          status: 'inprocess',
          messages: updatedMessages
        });

        setIsStreaming(true);
        setStreamingMessageId(aiMsgId);
        isStreamingRef.current = true;

        const mockText = MOCK_RESPONSES[Math.floor(Math.random() * MOCK_RESPONSES.length)];
          let currentText = '';
          for (const char of mockText) {
            if (!isStreamingRef.current) break;
            currentText += char;
            onUpdate({
              ...sessionRef.current,
              messages: sessionRef.current.messages.map(m =>
                m.id === aiMsgId ? { ...m, content: currentText } : m
              )
            });
            await new Promise(r => setTimeout(r, 20));
          }

          setIsStreaming(false);
          setStreamingMessageId(null);
          isStreamingRef.current = false;
          onUpdate({
            ...sessionRef.current,
            status: 'review',
            diff: generateMockDiff()
          });
      };

      triggerInitialResponse();
    }
  }, []); // Run on mount

  const handleSend = async () => {
    if (!inputValue.trim() || isStreaming) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue,
      type: 'text'
    };

    const aiMsgId = (Date.now() + 1).toString();
    const aiMsg: Message = {
      id: aiMsgId,
      role: 'assistant',
      content: '',
      type: 'text'
    };

    const updatedMessages = [...sessionRef.current.messages, userMsg, aiMsg];
    
    onUpdate({
      ...sessionRef.current,
      status: 'inprocess',
      messages: updatedMessages
    });

    setInputValue('');
    setIsStreaming(true);
    setStreamingMessageId(aiMsgId);
    isStreamingRef.current = true;

    const mockText = MOCK_RESPONSES[Math.floor(Math.random() * MOCK_RESPONSES.length)];
    let currentText = '';
    for (const char of mockText) {
      if (!isStreamingRef.current) break;
      currentText += char;
      onUpdate({
        ...sessionRef.current,
        messages: sessionRef.current.messages.map(m =>
          m.id === aiMsgId ? { ...m, content: currentText } : m
        )
      });
      await new Promise(r => setTimeout(r, 20));
    }

    setIsStreaming(false);
    setStreamingMessageId(null);
    isStreamingRef.current = false;
    onUpdate({
      ...sessionRef.current,
      status: 'review',
      diff: generateMockDiff()
    });
  };

  const handleStop = () => {
    isStreamingRef.current = false;
    setIsStreaming(false);
    setStreamingMessageId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTitleSave = () => {
    const newTitle = editTitle.trim();
    if (newTitle && newTitle !== session.title) {
      onUpdate({ ...session, title: newTitle });
    }
    setIsEditingTitle(false);
  };

  const handleTitleCancel = () => {
    setIsEditingTitle(false);
  };

  const handleTitleDoubleClick = () => {
    setEditTitle(session.title);
    setIsEditingTitle(true);
  };

  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  return (
    <div className={`flex flex-col overflow-hidden text-sm text-gray-200 ${
      fullScreen 
        ? 'w-full h-full bg-transparent' 
        : 'w-[600px] bg-[#3B3F4F]/95 backdrop-blur-3xl rounded-[32px] border border-white/10 shadow-2xl'
    }`}>
      {/* Header */}
      <div className={`session-header flex items-center justify-between p-4 px-6 ${fullScreen ? 'border-b border-white/5 bg-black/20' : 'cursor-move'}`}>
        <div className="flex items-center gap-3">
          {onClose && (
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors">
              <X size={16} className="text-gray-400" />
            </button>
          )}
          <span className={`w-2 h-2 rounded-full shrink-0 ${
            isStreaming
              ? 'bg-yellow-400 animate-pulse'
              : session.status === 'review' || session.status === 'done'
                ? 'bg-green-400'
                : 'bg-gray-400'
          }`} />
          {isEditingTitle ? (
            <input
              ref={titleInputRef}
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') {
                  handleTitleSave();
                } else if (e.key === 'Escape') {
                  handleTitleCancel();
                }
              }}
              onMouseDown={(e) => e.stopPropagation()}
              maxLength={100}
              className={`bg-transparent border-b border-white/30 outline-none font-medium text-white ${
                fullScreen ? 'text-lg' : 'text-sm max-w-[200px]'
              }`}
            />
          ) : (
            <div className="group/title flex items-center gap-1.5">
              <span
                onDoubleClick={handleTitleDoubleClick}
                className={`font-medium text-white truncate cursor-default ${
                  fullScreen ? 'text-lg' : 'text-sm max-w-[200px]'
                }`}
              >
                {session.title}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); handleTitleDoubleClick(); }}
                onMouseDown={(e) => e.stopPropagation()}
                className="opacity-0 group-hover/title:opacity-100 text-gray-400 hover:text-white transition-opacity"
              >
                <Pencil size={12} />
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 text-gray-400">
          <button className="hover:text-gray-200 transition-colors"><Clock size={18} /></button>
          <button className="hover:text-gray-200 transition-colors"><Plus size={20} /></button>
        </div>
      </div>

      {/* Content */}
      <div 
        ref={scrollContainerRef}
        className={`flex-1 overflow-y-auto custom-scrollbar ${fullScreen ? 'p-8' : 'p-6 pt-2 max-h-[600px]'}`}
      >
        <div className={`space-y-6 ${fullScreen ? 'max-w-4xl mx-auto w-full' : ''}`}>
          {session.id === '1' ? (
            <ComplexMockContent />
          ) : (
            <div className="space-y-6">
              {session.messages.map(msg => (
                <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className={`max-w-[85%] ${
                    msg.role === 'user' 
                      ? 'bg-white/10 text-gray-200 rounded-3xl px-5 py-3.5' 
                      : 'text-gray-300 w-full'
                  }`}>
                    <div className="whitespace-pre-wrap leading-relaxed text-[15px]">
                      {msg.content}
                      {isStreaming && streamingMessageId === msg.id && (
                        <span className="inline-block w-1.5 h-3.5 ml-1 bg-current animate-pulse align-middle"></span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Input */}
      <div className={`p-4 pb-6 ${fullScreen ? 'w-full max-w-4xl mx-auto' : 'px-6'}`}>
        <div className={`bg-[#A07841]/30 backdrop-blur-xl rounded-[24px] p-2 flex flex-col gap-2 border border-white/10 shadow-xl focus-within:border-white/20 focus-within:ring-4 focus-within:ring-white/5 transition-all`}>
          <textarea 
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="随便问..." 
            rows={1}
            className="bg-transparent border-none outline-none px-4 py-3 text-white placeholder-gray-400 w-full resize-none min-h-[44px] max-h-[200px]"
            style={{ height: 'auto' }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = 'auto';
              target.style.height = `${Math.min(target.scrollHeight, 200)}px`;
            }}
          />
          <div className="flex items-center justify-between px-2 pb-1">
            <div className="flex items-center gap-2">
              <button className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-gray-300 hover:text-white transition-colors">
                <Plus size={16} />
              </button>
              <button className="bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white px-3 py-1.5 rounded-full text-xs font-medium transition-colors border border-white/5">
                Claude Opus 4.6
              </button>
              
              {/* Review Button */}
              {session.status === 'review' && session.diff && (session.diff.totalAdditions > 0 || session.diff.totalDeletions > 0) && (
                <button 
                  onClick={onOpenReview}
                  className="flex items-center gap-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border border-blue-500/20"
                >
                  <span className="flex items-center"><Plus size={12} className="mr-0.5"/>{session.diff.totalAdditions}</span>
                  <span className="flex items-center ml-1"><Minus size={12} className="mr-0.5"/>{session.diff.totalDeletions}</span>
                  <span className="ml-1 text-blue-300">Review</span>
                </button>
              )}
            </div>
            {isStreaming ? (
              <button 
                onClick={handleStop}
                className="w-8 h-8 rounded-full bg-red-500/20 hover:bg-red-500/40 flex items-center justify-center text-red-400 transition-colors"
              >
                <Square size={14} fill="currentColor" />
              </button>
            ) : (
              <button 
                onClick={handleSend}
                disabled={!inputValue.trim()}
                className="w-8 h-8 rounded-full bg-white/10 text-white hover:bg-white/20 disabled:bg-white/5 disabled:text-gray-500 flex items-center justify-center transition-colors border border-white/5"
              >
                <ArrowUp size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ComplexMockContent() {
  return (
    <div className="space-y-6 text-[15px] text-gray-300 leading-relaxed">
      {/* Previous AI Message Part */}
      <div className="space-y-4">
        <h3 className="text-white font-medium text-base">Project Setup Complete</h3>
        <p>I've initialized the project with the following structure:</p>
        <ul className="space-y-1.5 list-disc list-inside marker:text-gray-500">
          <li><span className="text-gray-400">Framework:</span> React 18 with TypeScript</li>
          <li><span className="text-gray-400">Styling:</span> Tailwind CSS v4 with custom theme</li>
          <li><span className="text-gray-400">Build tool:</span> Vite for blazing fast HMR</li>
        </ul>
        <div className="border-l-2 border-white/10 pl-4 py-1 text-gray-400 italic text-sm">
          Configuration follows best practices for production builds with tree-shaking and code splitting.
        </div>
        <p>Here's the main entry point:</p>

        <div className="bg-[#2B2D3A] rounded-xl overflow-hidden border border-white/5">
          <div className="flex items-center justify-between px-4 py-2 bg-black/20 border-b border-white/5 text-xs text-gray-400">
            <span>TSX</span>
            <button className="flex items-center gap-1.5 hover:text-gray-200 transition-colors">
              <Copy size={12} />
              <span>Copy</span>
            </button>
          </div>
          <div className="p-4 font-mono text-sm text-gray-300 overflow-x-auto">
            <pre><code><span className="text-blue-400">import</span> <span className="text-blue-200">React</span> <span className="text-blue-400">from</span> <span className="text-green-300">'react'</span>;
<span className="text-blue-400">import</span> {'{'} <span className="text-blue-200">createRoot</span> {'}'} <span className="text-blue-400">from</span> <span className="text-green-300">'react-dom/client'</span>;
<span className="text-blue-400">import</span> <span className="text-blue-200">App</span> <span className="text-blue-400">from</span> <span className="text-green-300">'./App'</span>;
<span className="text-blue-400">import</span> <span className="text-green-300">'./styles/globals.css'</span>;

<span className="text-blue-400">const</span> <span className="text-blue-200">root</span> = <span className="text-yellow-200">createRoot</span>(document.<span className="text-yellow-200">getElementById</span>(<span className="text-green-300">'root'</span>)!);
root.<span className="text-yellow-200">render</span>(
  &lt;<span className="text-blue-300">React.StrictMode</span>&gt;
    &lt;<span className="text-blue-300">App</span> /&gt;
  &lt;/<span className="text-blue-300">React.StrictMode</span>&gt;
);</code></pre>
          </div>
        </div>
        <p>
          The <code className="bg-white/10 px-1.5 py-0.5 rounded text-sm">tsconfig.json</code> has been configured with strict mode and path aliases for cleaner imports.
        </p>
        <div className="flex items-center gap-3 text-gray-500 pt-1">
          <button className="hover:text-gray-300 transition-colors"><Copy size={16} /></button>
          <button className="hover:text-gray-300 transition-colors"><ThumbsUp size={16} /></button>
          <button className="hover:text-gray-300 transition-colors"><ThumbsDown size={16} /></button>
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          <button className="bg-white/5 hover:bg-white/10 border border-white/5 px-4 py-2 rounded-full text-sm transition-colors">Add testing setup</button>
          <button className="bg-white/5 hover:bg-white/10 border border-white/5 px-4 py-2 rounded-full text-sm transition-colors">Configure CI/CD</button>
          <button className="bg-white/5 hover:bg-white/10 border border-white/5 px-4 py-2 rounded-full text-sm transition-colors">Add ESLint rules</button>
        </div>
      </div>

      {/* User Message */}
      <div className="flex justify-end pt-4">
        <div className="bg-white/10 text-gray-200 rounded-3xl px-5 py-3.5 max-w-[85%]">
          帮我重构用户认证模块，加上单元测试
        </div>
      </div>

      {/* AI Response with Tool Calls */}
      <div className="space-y-4 pt-4">
        <div className="flex items-center gap-2 text-gray-500 text-sm">
          <div className="w-4 h-4 rounded-full border-2 border-gray-500 border-t-transparent animate-spin"></div>
          <span>Thinking for 5s</span>
        </div>

        <div className="space-y-2.5 font-mono text-sm">
          <div className="flex items-center justify-between group cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 rounded-full bg-green-500/20 flex items-center justify-center text-green-500">
                <Check size={10} strokeWidth={3} />
              </div>
              <span className="text-purple-400 font-medium">glob</span>
              <span className="text-gray-400">src/auth/**/*.{"{ts,tsx}"}</span>
            </div>
            <div className="flex items-center gap-2 text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity">
              <span>0.3s</span>
              <span className="text-xs">&gt;</span>
            </div>
          </div>

          <div className="flex items-center justify-between group cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 rounded-full bg-green-500/20 flex items-center justify-center text-green-500">
                <Check size={10} strokeWidth={3} />
              </div>
              <span className="text-blue-400 font-medium">read</span>
              <span className="text-gray-400">src/auth/AuthProvider.tsx</span>
            </div>
            <div className="flex items-center gap-2 text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity">
              <span>0.1s</span>
              <span className="text-xs">&gt;</span>
            </div>
          </div>

          <div className="flex items-center justify-between group cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 rounded-full bg-green-500/20 flex items-center justify-center text-green-500">
                <Check size={10} strokeWidth={3} />
              </div>
              <span className="text-green-400 font-medium">bash</span>
              <span className="text-gray-400">npm test -- --coverage src/auth/</span>
            </div>
            <div className="flex items-center gap-2 text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity">
              <span>3.2s</span>
              <span className="text-xs">&gt;</span>
            </div>
          </div>

          <div className="flex items-center justify-between group cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 rounded-full bg-green-500/20 flex items-center justify-center text-green-500">
                <Check size={10} strokeWidth={3} />
              </div>
              <span className="text-orange-400 font-medium">write</span>
              <span className="text-gray-400">src/auth/AuthProvider.tsx — refactored with useReducer</span>
            </div>
            <div className="flex items-center gap-2 text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity">
              <span>0.2s</span>
            </div>
          </div>

          <div className="flex items-center justify-between group cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 rounded-full bg-green-500/20 flex items-center justify-center text-green-500">
                <Check size={10} strokeWidth={3} />
              </div>
              <span className="text-orange-400 font-medium">write</span>
              <span className="text-gray-400">src/auth/__tests__/auth.test.ts — added 6 new tests</span>
            </div>
            <div className="flex items-center gap-2 text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity">
              <span>0.1s</span>
            </div>
          </div>
        </div>

        <div className="pt-4 space-y-4">
          <p>Refactored the auth module. Key changes:</p>
          <ol className="list-decimal list-inside space-y-2.5 text-gray-300 marker:text-gray-500">
            <li>Replaced <code className="bg-white/10 px-1.5 py-0.5 rounded text-sm">useState</code> with <code className="bg-white/10 px-1.5 py-0.5 rounded text-sm">useReducer</code> for cleaner state transitions</li>
            <li>Extracted token management into <code className="bg-white/10 px-1.5 py-0.5 rounded text-sm">tokenService.ts</code></li>
            <li>Added <strong>6 new unit tests</strong> covering edge cases</li>
            <li>Test coverage improved from <em className="text-gray-400">72%</em> to <em className="text-gray-400">94.3%</em></li>
          </ol>
        </div>

        <div className="flex items-center gap-3 text-gray-500 pt-2">
          <button className="hover:text-gray-300 transition-colors"><Copy size={16} /></button>
          <button className="hover:text-gray-300 transition-colors"><ThumbsUp size={16} /></button>
          <button className="hover:text-gray-300 transition-colors"><ThumbsDown size={16} /></button>
        </div>
      </div>
    </div>
  );
}
