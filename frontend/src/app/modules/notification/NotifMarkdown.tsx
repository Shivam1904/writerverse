import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** Tiny, constrained markdown render for notification bodies (bold, headings,
 *  bullets, links). Styled small/subtle via `.wv2-notif-body` in notification.css. */
export function NotifMarkdown({ children }: { children: string }) {
  return (
    <div className="wv2-notif-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children || ''}</ReactMarkdown>
    </div>
  );
}
