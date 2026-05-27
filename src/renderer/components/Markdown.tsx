import type { ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/** Renders assistant markdown (chat answers, explanations) styled to the theme. */
export function Markdown({ content }: { content: string }): ReactNode {
  return (
    <div className="space-y-2 text-[13px] leading-relaxed text-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p>{children}</p>,
          strong: ({ children }) => (
            <strong className="font-semibold text-content">{children}</strong>
          ),
          a: ({ children, href }) => (
            <a href={href} className="text-accent hover:underline">
              {children}
            </a>
          ),
          ul: ({ children }) => (
            <ul className="list-disc space-y-1 pl-5">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal space-y-1 pl-5">{children}</ol>
          ),
          h1: ({ children }) => <h3 className="text-sm font-semibold">{children}</h3>,
          h2: ({ children }) => <h3 className="text-sm font-semibold">{children}</h3>,
          h3: ({ children }) => <h3 className="text-sm font-semibold">{children}</h3>,
          pre: ({ children }) => (
            <pre className="overflow-x-auto rounded-md border border-line bg-app p-2.5 font-mono text-[12px]">
              {children}
            </pre>
          ),
          code: ({ className, children }) => {
            const isBlock = /language-/.test(className ?? '')
            return isBlock ? (
              <code className="font-mono text-[12px]">{children}</code>
            ) : (
              <code className="rounded bg-surface px-1 py-0.5 font-mono text-[12px] text-accent">
                {children}
              </code>
            )
          }
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
