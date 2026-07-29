/** O que o resto da API sabe sobre quem está logado — nunca o `passwordHash`. */
export type AuthenticatedUser = {
  id: string;
  name: string;
  email: string;
};

declare global {
  // Único jeito de aumentar `Express.Request` com `user` — não há alternativa
  // em módulo ES2015 para isto.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}
