// Copies data from production to the staging database (docs/environments.md):
// - the public library (everything approved), and
// - the own recipes, library items and stock of one brewery (the brewery of SOURCE_EMAIL).
// Everything lands in the brewery of TARGET_EMAIL in staging (that user must exist there),
// with the same ids, so references between recipes and library items keep working.
// Production is only read. Brews, tasting notes, teams and other breweries are not copied.
//
// Runs in the "Copy data to staging" workflow. Needs: SUPABASE_ACCESS_TOKEN, PROD_REF,
// STAGING_REF, SOURCE_EMAIL, TARGET_EMAIL.

const { SUPABASE_ACCESS_TOKEN, PROD_REF, STAGING_REF, SOURCE_EMAIL, TARGET_EMAIL } = process.env;
for (const [k, v] of Object.entries({ SUPABASE_ACCESS_TOKEN, PROD_REF, STAGING_REF, SOURCE_EMAIL, TARGET_EMAIL })) {
  if (!v) throw new Error(`${k} is not set`);
}
if (PROD_REF === STAGING_REF) throw new Error('PROD_REF and STAGING_REF are the same project');

const TABLES = ['recipes', 'fermentables', 'hops', 'cultures', 'miscs', 'styles', 'mash_profiles', 'equipment', 'waters'];

const literal = (s) => `'${String(s).replace(/'/g, "''")}'`;

async function query(ref, sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Query on ${ref === PROD_REF ? 'production' : 'staging'} failed (${res.status}): ${text.slice(0, 500)}`);
  return JSON.parse(text);
}

const offline = process.env.PAYLOAD_FILE; // test: read the payload from a file, print the staging SQL
// 1. Read from production (SELECT only)
const source = `(SELECT p.brewery_id FROM public.profiles p JOIN auth.users u ON u.id = p.id WHERE lower(u.email) = lower(${literal(SOURCE_EMAIL)}))`;
const parts = TABLES.map(t => `'${t}', coalesce((
    SELECT json_agg(json_build_object('id', x.id, 'data', x.data, 'status', x.status))
    FROM public.${t} x
    WHERE x.status = 'approved' OR (x.status = 'private' AND x.brewery_id = ${source})
  ), '[]'::json)`);
const [read] = offline ? [{ found: true, payload: JSON.parse((await import('node:fs')).readFileSync(offline, 'utf8')) }] : await query(PROD_REF, `
  SELECT ${source} IS NOT NULL AS found, json_build_object(${parts.join(',\n')},
    'stock', coalesce((SELECT json_agg(json_build_object('ingredient_type', s.ingredient_type, 'ingredient_id', s.ingredient_id,
                                                      'amount', s.amount, 'unit', s.unit, 'target', s.target))
                       FROM public.stock s WHERE s.brewery_id = ${source}), '[]'::json)) AS payload`);
if (!read.found) throw new Error('SOURCE_EMAIL has no brewery in production');
const payload = read.payload;
console.log('Read from production:', Object.fromEntries(Object.entries(payload).map(([k, v]) => [k, v.length])));

// 2. Write to staging, in one transaction
const tag = `copy_${Math.random().toString(36).slice(2)}`;
const json = JSON.stringify(payload);
if (json.includes(`$${tag}$`)) throw new Error('Unlucky quote tag, run again');
const upserts = TABLES.map(t => `
  -- ${t}: free the names (another row with the same name in the same place), then upsert by id
  DELETE FROM public.${t} x USING src, tgt, jsonb_to_recordset(src.j->'${t}') AS r(id text, data jsonb, status text)
    WHERE x.id <> r.id AND x.status = r.status AND public.name_key(x.data->>'name') = public.name_key(r.data->>'name')
      AND (r.status = 'approved' OR x.brewery_id = tgt.brewery_id);
  INSERT INTO public.${t} (id, data, user_id, brewery_id, status)
    SELECT r.id, r.data, tgt.user_id, tgt.brewery_id, r.status
    FROM src, tgt, jsonb_to_recordset(src.j->'${t}') AS r(id text, data jsonb, status text)
  ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, status = EXCLUDED.status,
    user_id = EXCLUDED.user_id, brewery_id = EXCLUDED.brewery_id;`);

// The statements need src and tgt: keep them in temporary tables for this session
const sql = `
BEGIN;
CREATE TEMP TABLE src ON COMMIT DROP AS SELECT $${tag}$${json}$${tag}$::jsonb AS j;
CREATE TEMP TABLE tgt ON COMMIT DROP AS
  SELECT p.id AS user_id, p.brewery_id FROM public.profiles p JOIN auth.users u ON u.id = p.id
  WHERE lower(u.email) = lower(${literal(TARGET_EMAIL)}) AND p.brewery_id IS NOT NULL;
DO $check$ BEGIN
  IF (SELECT count(*) FROM tgt) <> 1 THEN RAISE EXCEPTION 'TARGET_EMAIL has no brewery in staging'; END IF;
END $check$;
${upserts.join('\n')}
INSERT INTO public.stock (ingredient_type, ingredient_id, brewery_id, amount, unit, target)
  SELECT r.ingredient_type, r.ingredient_id, tgt.brewery_id, r.amount, r.unit, r.target
  FROM src, tgt, jsonb_to_recordset(src.j->'stock') AS r(ingredient_type text, ingredient_id text, amount numeric, unit text, target numeric)
ON CONFLICT (ingredient_type, ingredient_id) DO UPDATE SET brewery_id = EXCLUDED.brewery_id,
  amount = EXCLUDED.amount, unit = EXCLUDED.unit, target = EXCLUDED.target;
COMMIT;
SELECT ${TABLES.map(t => `(SELECT count(*) FROM public.${t}) AS ${t}`).join(', ')}, (SELECT count(*) FROM public.stock) AS stock;`;

if (offline) { console.log(sql); process.exit(0); }
const result = await query(STAGING_REF, sql);
console.log('Staging now has:', result[result.length - 1] ?? result);
