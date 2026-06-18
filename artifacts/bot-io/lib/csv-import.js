'use strict';

const db = require('./db');

const MAX_ROWS = 10_000;

/**
 * Parse a raw CSV string into an array of row objects.
 * Accepts: phone (required), name (optional), tags (optional, comma-separated inside quotes or pipe-separated)
 * First row is always treated as a header.
 */
function parseCsv(raw) {
  // Normalise line endings
  const lines = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  const nonEmpty = lines.filter(l => l.trim().length > 0);
  if (nonEmpty.length < 2) {
    throw Object.assign(new Error('CSV deve ter ao menos uma linha de cabeçalho e uma linha de dados.'), { status: 400 });
  }

  const header = splitCsvLine(nonEmpty[0]).map(h => h.toLowerCase().trim());

  const phoneIdx = header.findIndex(h => ['phone', 'telefone', 'numero', 'número', 'whatsapp'].includes(h));
  const nameIdx  = header.findIndex(h => ['name', 'nome'].includes(h));
  const tagsIdx  = header.findIndex(h => ['tags', 'etiquetas', 'grupos'].includes(h));

  if (phoneIdx === -1) {
    throw Object.assign(
      new Error('Coluna "phone" (ou "telefone"/"numero") não encontrada no cabeçalho.'),
      { status: 400 }
    );
  }

  const rows = [];
  for (let i = 1; i < nonEmpty.length; i++) {
    if (rows.length >= MAX_ROWS) break;
    const cols = splitCsvLine(nonEmpty[i]);
    const rawPhone = (cols[phoneIdx] || '').trim();
    if (!rawPhone) continue;

    const name = nameIdx >= 0 ? (cols[nameIdx] || '').trim() : '';
    const rawTags = tagsIdx >= 0 ? (cols[tagsIdx] || '').trim() : '';
    const tags = rawTags
      ? rawTags.split(/[,|;]/).map(t => t.trim()).filter(Boolean)
      : [];

    rows.push({ rawPhone, name, tags });
  }
  return rows;
}

/** Minimal RFC 4180-compliant CSV line splitter (handles quoted fields). */
function splitCsvLine(line) {
  const fields = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === ',' && !inQuotes) {
      fields.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

function normalizePhone(raw) {
  const digits = raw.replace(/[^0-9]/g, '');
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

function toJid(phone) {
  return `${phone}@s.whatsapp.net`;
}

/**
 * Import contacts from a raw CSV string for a given userId.
 * Returns { imported, updated, skipped, errors, sample }.
 */
async function importContacts(userId, csvText) {
  let rows;
  try {
    rows = parseCsv(csvText);
  } catch (e) {
    throw e;
  }

  if (rows.length === 0) {
    throw Object.assign(new Error('Nenhum contato válido encontrado no CSV.'), { status: 400 });
  }

  let imported = 0;
  let updated  = 0;
  let skipped  = 0;
  const errors = [];
  const sample = [];

  for (const row of rows) {
    const phone = normalizePhone(row.rawPhone);
    if (!phone) {
      skipped++;
      if (errors.length < 20) {
        errors.push({ raw: row.rawPhone, reason: 'Número inválido (muito curto ou longo).' });
      }
      continue;
    }

    const jid  = toJid(phone);
    const name = row.name || phone;

    try {
      const existing = await db.query(
        'SELECT id FROM contacts WHERE user_id=$1 AND jid=$2',
        [userId, jid]
      );

      if (existing.rows.length) {
        await db.query(
          `UPDATE contacts SET name=$1, phone=$2, tags=$3, updated_at=NOW()
           WHERE user_id=$4 AND jid=$5`,
          [name, phone, row.tags, userId, jid]
        );
        updated++;
      } else {
        await db.query(
          `INSERT INTO contacts(user_id, jid, name, phone, tags)
           VALUES($1,$2,$3,$4,$5)`,
          [userId, jid, name, phone, row.tags]
        );
        imported++;
      }

      if (sample.length < 5) sample.push({ phone, name, tags: row.tags });
    } catch (e) {
      skipped++;
      if (errors.length < 20) {
        errors.push({ raw: row.rawPhone, reason: e.message });
      }
    }
  }

  return { imported, updated, skipped, total: rows.length, errors, sample };
}

module.exports = { importContacts, parseCsv, MAX_ROWS };
