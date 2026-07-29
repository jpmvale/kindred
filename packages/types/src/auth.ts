/** Quem está logado (BL-10) — nunca carrega a senha, nem o hash dela. */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

export interface RegisterData {
  name: string;
  email: string;
  password: string;
}

export interface LoginData {
  email: string;
  password: string;
}
