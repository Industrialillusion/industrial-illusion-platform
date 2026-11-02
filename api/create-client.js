/* ==========================================================================
 *  api/create-client.js · Vercel Serverless
 *  Crea cliente + utente Auth + profilo collegato (tutto in 1 chiamata)
 * ========================================================================== */
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://www.industrialillusion.ma');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return res.status(500).json({ error: 'Server config error' });
  }

  const auth = req.headers.authorization || '';
  const jwt = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!jwt) return res.status(401).json({ error: 'Missing Authorization' });

  const userClient = createClient(url, jwt, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false },
  });

  const { data: isAdmin, error: adminErr } = await userClient.rpc('is_admin');
  if (adminErr) return res.status(500).json({ error: 'Auth check failed', detail: adminErr.message });
  if (!isAdmin) return res.status(403).json({ error: 'NOT_ADMIN' });

  const b = req.body || {};
  const required = ['raison_sociale', 'contact_name', 'email', 'phone_whatsapp', 'address'];
  for (const k of required) {
    if (!b[k] || typeof b[k] !== 'string' || !b[k].trim()) {
      return res.status(400).json({ error: `Champ requis manquant: ${k}` });
    }
  }
  if (!b.password || b.password.length < 8) {
    return res.status(400).json({ error: 'Mot de passe trop court (min 8)' });
  }

  const adminClient = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email: b.email.trim().toLowerCase(),
      password: b.password,
      email_confirm: true,
      user_metadata: {
        full_name: b.contact_name.trim(),
        role: 'client',
      },
    });

    if (authError) {
      if (authError.message && authError.message.includes('already been registered')) {
        return res.status(409).json({
          error: 'EMAIL_ALREADY_REGISTERED',
          detail: 'Cet email existe déjà. Utilisez "Lier un profil existant".',
        });
      }
      throw new Error(`auth.createUser: ${authError.message}`);
    }

    const userId = authData.user.id;

    const { data: clientRow, error: clientError } = await adminClient
      .from('clients')
      .insert({
        company_name:    b.raison_sociale.trim(),
        horeca_category: b.category || null,
        contact_name:    b.contact_name.trim(),
        email:           b.email.trim().toLowerCase(),
        phone:           b.phone_whatsapp.trim(),
        address:         b.address.trim(),
        district:        b.district || null,
        google_maps_url: b.google_maps_url || null,
        ice:             b.ice || null,
        if_fiscal:       b.if_fiscal || null,
        rc:              b.rc || null,
        patente:         b.patente || null,
        fiche_technique_url: b.fiche_technique_url || null,
        contract_url:        b.contract_url || null,
        status:          'ACTIVE',
        created_by:      authData.user.id,
      })
      .select()
      .single();

    if (clientError) {
      await adminClient.auth.admin.deleteUser(userId).catch(() => {});
      throw new Error(`clients.insert: ${clientError.message}`);
    }

    const { error: profErr } = await adminClient
      .from('profiles')
      .update({
        client_id: clientRow.id,
        role: 'client',
        status: 'ACTIVE',
        full_name: b.contact_name.trim(),
      })
      .eq('id', userId);

    if (profErr) {
      await adminClient.from('clients').delete().eq('id', clientRow.id).catch(() => {});
      await adminClient.auth.admin.deleteUser(userId).catch(() => {});
      throw new Error(`profiles.link: ${profErr.message}`);
    }

    return res.status(200).json({
      ok: true,
      client_id: clientRow.id,
      user_id: userId,
      email: b.email.trim().toLowerCase(),
      temporary_password: b.password,
    });
  } catch (err) {
    console.error('[create-client] error:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}
