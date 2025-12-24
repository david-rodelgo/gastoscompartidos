import type { Handler } from "@netlify/functions";
import { neon } from "@netlify/neon";

const sql = neon();

export const handler: Handler = async (event) => {
  const id = event.queryStringParameters?.id;
  const k = event.queryStringParameters?.k;

  if (!id || !k) {
    return { statusCode: 400, body: "Faltan parámetros" };
  }

  const rows = await sql(
  "select data, access_key from public.trip_groups where id = $1 limit 1",
  [id]
);


  if (!rows.length) {
    return { statusCode: 404, body: "Viaje no encontrado" };
  }

  if (rows[0].access_key !== k) {
    return { statusCode: 403, body: "Clave incorrecta" };
  }

  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(rows[0].data),
  };
};
