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

/** Trocar e-mail e/ou senha da própria conta (BL-16) — pelo menos um dos dois
 * opcionais precisa vir; a validação disso é do servidor. */
export interface UpdateMeData {
  currentPassword: string;
  email?: string;
  newPassword?: string;
}
