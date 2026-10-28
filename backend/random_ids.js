/** Generadores simples de identificadores y códigos aleatorios (sin criptografía). */

const HEX = '0123456789ABCDEF';

/** Devuelve una cadena hexadecimal en mayúsculas con la cantidad de dígitos indicada. */
export function randomHex(length) {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += HEX[Math.floor(Math.random() * 16)];
  }
  return out;
}

/** Identificador aleatorio de 32 dígitos hexadecimales en minúsculas. */
export function randomId() {
  return randomHex(32).toLowerCase();
}
