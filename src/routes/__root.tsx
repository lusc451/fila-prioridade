import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import type { ReactNode } from "react";

import appCss from "../styles.css?url";
import { StoreProvider } from "@/lib/store";
import { AuthProvider } from "@/lib/auth";
import { Toaster } from "@/components/ui/sonner";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "TriaFila — Gestão de Fila de Consultas" },
      { name: "description", content: "Sistema para classificação de prioridade e gestão da fila de consultas médicas." },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: () => (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold">Página não encontrada</h1>
        <a href="/" className="mt-4 inline-block text-primary underline">Voltar ao início</a>
      </div>
    </div>
  ),
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head><HeadContent /></head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <StoreProvider>
          <Outlet />
          <Toaster richColors position="top-right" />
        </StoreProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
