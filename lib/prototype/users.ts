export const USER_COOKIE = "wm_uid";

export function selectUserCookie(id: string) {
  document.cookie = `${USER_COOKIE}=${id}; path=/; max-age=31536000; samesite=lax`;
}

export function clearUserCookie() {
  document.cookie = `${USER_COOKIE}=; path=/; max-age=0`;
}
