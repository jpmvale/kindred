import axios from 'axios';

/**
 * Cliente HTTP único (BL-10) — antes cada arquivo de `api/` criava sua própria
 * instância `axios.create`, sem interceptor nenhum. Consolidar aqui dá um
 * lugar central para `withCredentials` (o cookie httpOnly de sessão só viaja
 * com isso ligado) e para reagir a sessão expirando **no meio do uso**, não só
 * na entrada — o `layoutLoader` já cobre a entrada, mas nada cobria uma ação
 * no meio de uma sessão que expirou entretanto.
 */
export const client = axios.create({ baseURL: '/api', withCredentials: true });

client.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    // A tentativa de login em si dá 401 esperado quando a senha está errada —
    // isso é tratado localmente pela tela; redirecionar aqui apagaria a
    // mensagem de erro que o formulário mostraria.
    const isAuthCall =
      axios.isAxiosError(error) && error.config?.url?.startsWith('/auth/');
    if (
      axios.isAxiosError(error) &&
      error.response?.status === 401 &&
      !isAuthCall
    ) {
      window.location.assign('/login');
    }
    return Promise.reject(error as Error);
  },
);
