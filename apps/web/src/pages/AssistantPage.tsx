import { Link } from 'react-router';
import { Bot } from 'lucide-react';
import { useLayout } from '@/components/AppLayout';
import { AiChat } from '@/components/AiChat';

export function AssistantPage() {
  const { me } = useLayout();
  if (!me.features.ai) {
    return (
      <div className="mx-auto max-w-lg px-8 py-24 text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-xl bg-accent-soft text-accent">
          <Bot className="size-6" />
        </div>
        <h1 className="mt-4 text-lg font-semibold">Assistente de IA desativado</h1>
        <p className="mt-2 text-sm text-fg-muted">
          {me.role === 'admin' ? (
            <>
              Conecte um provedor (OpenAI, Anthropic, Ollama local…) em{' '}
              <Link to="/admin/ai" className="font-medium text-accent hover:underline">
                Administração → Inteligência Artificial
              </Link>
              .
            </>
          ) : (
            'Peça a um administrador para conectar um provedor de IA.'
          )}
        </p>
      </div>
    );
  }
  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col px-6 py-8">
      <div className="mb-4 shrink-0">
        <h1 className="text-xl font-semibold tracking-tight">Assistente</h1>
        <p className="text-sm text-fg-muted">Respostas baseadas na documentação da {me.workspaceName}, com os documentos usados como fonte.</p>
      </div>
      <div className="min-h-0 flex-1">
        <AiChat
          storageKey="arkivo:chat:global"
          suggestions={['Como funciona o backup dos servidores?', 'Quais procedimentos existem para novos colaboradores?', 'Liste os documentos sobre banco de dados']}
        />
      </div>
    </div>
  );
}
