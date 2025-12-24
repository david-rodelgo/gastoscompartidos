import type { Handler } from "@netlify/functions";
import { neon } from "@netlify/neon";

const sql = neon();

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "POST only" };

  const { id, k, group } = JSON.parse(event.body || "{}");
  if (!id || !k || !group) return { statusCode: 400, body: "Faltan campos (id,k,group)" };

  const rows = await sql("select access_key from public.trip_groups where id=$1 limit 1", [id]);
  if (!rows.length) return { statusCode: 404, body: "Viaje no encontrado" };
  if (rows[0].access_key !== k) return { statusCode: 403, body: "Clave incorrecta" };

  await sql(
  "update public.trip_groups set data=$2::jsonb, updated_at=now() where id=$1",
  [id, JSON.stringify(group)]
);

  return { statusCode: 200, body: "OK" };
};
