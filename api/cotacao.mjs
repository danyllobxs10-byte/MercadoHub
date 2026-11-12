// Função da Vercel: reaproveita a mesma lógica usada no Netlify.
import handler from "../netlify/functions/cotacao.mjs";
export const GET = (request) => handler(request);
