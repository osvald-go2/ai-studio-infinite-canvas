import { Session } from './types';

export const initialSessions: Session[] = [
  {
    id: '1',
    title: 'Deployment Setup',
    model: 'Claude Opus 4.6',
    status: 'inprocess',
    position: { x: 100, y: 100 },
    messages: [
      {
        id: 'm1',
        role: 'assistant',
        content: "I noticed there's a custom domain configured. I need the DNS details to proceed.\n\n```bash\n# Please configure your DNS records as follows:\nType: CNAME\nName: app\nValue: cname.vercel-dns.com.\n```\n\nOnce configured, let me know."
      }
    ]
  },
  {
    id: '2',
    title: 'Database Migration',
    model: 'GPT-4o',
    status: 'inbox',
    position: { x: 800, y: 150 },
    messages: [
      {
        id: 'm1',
        role: 'user',
        content: 'We need to migrate the users table to add a stripe_customer_id column.',
      }
    ]
  },
  {
    id: '3',
    title: 'Auth Implementation',
    model: 'Gemini 1.5 Pro',
    status: 'review',
    position: { x: 150, y: 800 },
    messages: [
      {
        id: 'm1',
        role: 'user',
        content: 'Review the OAuth callback logic.',
      }
    ]
  }
];
