import * as dotenv from 'dotenv';
import { createPool } from './index.ts';
import { ensureSeedData } from './repositories.ts';

dotenv.config();

export async function setupDatabase() {
  console.log('--- Sahayak Database Initialization ---');
  const pool = createPool();

  let client;
  try {
    console.log('Testing connection to PostgreSQL...');
    client = await pool.connect();
    console.log('Connected to PostgreSQL successfully.');
  } catch (err: any) {
    console.error('\nDatabase Connection Error:');
    console.error(err.message || err);
    console.error('\nPlease check your database settings:');
    console.error('1. If using Docker: run "docker compose up -d"');
    console.error('2. If using Supabase / Neon: set DATABASE_URL in .env');
    console.error('3. If using local Postgres: verify host, port, user, password in .env\n');
    process.exit(1);
  }

  try {
    let hasPgVector = false;
    try {
      await client.query('CREATE EXTENSION IF NOT EXISTS vector;');
      hasPgVector = true;
      console.log('pgvector extension enabled.');
    } catch (extErr: any) {
      console.warn('Notice: pgvector extension could not be enabled (' + extErr.message + ').');
      console.warn('Falling back to standard table layout.');
    }

    console.log('Creating database tables and indexes...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS profiles (
        uid text PRIMARY KEY,
        email text,
        phone text,
        phone_verified boolean NOT NULL DEFAULT false,
        full_name text,
        is_guest boolean NOT NULL DEFAULT false,
        preferred_language text NOT NULL DEFAULT 'en',
        voice_speed real NOT NULL DEFAULT 1.0,
        text_size_level integer NOT NULL DEFAULT 1,
        theme text NOT NULL DEFAULT 'system',
        notification_channels jsonb NOT NULL DEFAULT '{"push":true,"sms":false,"whatsapp":false,"voiceCall":false}'::jsonb,
        consent_given boolean NOT NULL DEFAULT false,
        consent_timestamp timestamp,
        digilocker_linked boolean NOT NULL DEFAULT false,
        digilocker_account_ref text,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS user_roles (
        id serial PRIMARY KEY,
        user_uid text REFERENCES profiles(uid) ON DELETE CASCADE,
        email text NOT NULL,
        role text NOT NULL,
        is_active boolean NOT NULL DEFAULT true,
        invited_by text,
        created_at timestamp NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS otp_verifications (
        id serial PRIMARY KEY,
        identifier text NOT NULL,
        otp_hash text NOT NULL,
        channel text NOT NULL DEFAULT 'phone',
        expires_at timestamp NOT NULL,
        consumed boolean NOT NULL DEFAULT false,
        created_at timestamp NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS auth_sessions (
        id serial PRIMARY KEY,
        token_hash text NOT NULL UNIQUE,
        user_uid text NOT NULL REFERENCES profiles(uid) ON DELETE CASCADE,
        expires_at timestamp NOT NULL,
        created_at timestamp NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS languages (
        code text PRIMARY KEY,
        native_name text NOT NULL,
        english_name text NOT NULL,
        script text NOT NULL,
        direction text NOT NULL DEFAULT 'ltr',
        stt_supported boolean NOT NULL DEFAULT true,
        tts_supported boolean NOT NULL DEFAULT true,
        font_stack text NOT NULL,
        locale_code text NOT NULL,
        sample_greeting text NOT NULL,
        is_enabled boolean NOT NULL DEFAULT true,
        sort_order integer NOT NULL DEFAULT 100,
        created_at timestamp NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS ui_translations (
        id serial PRIMARY KEY,
        language_code text NOT NULL REFERENCES languages(code) ON DELETE CASCADE,
        translation_key text NOT NULL,
        translated_value text NOT NULL,
        is_auto_translated boolean NOT NULL DEFAULT true,
        is_reviewed boolean NOT NULL DEFAULT false,
        updated_by text,
        updated_at timestamp NOT NULL DEFAULT now()
      );

      CREATE UNIQUE INDEX IF NOT EXISTS ui_translations_lang_key_idx ON ui_translations(language_code, translation_key);

      CREATE TABLE IF NOT EXISTS glossary (
        id serial PRIMARY KEY,
        source_term text NOT NULL,
        language_code text NOT NULL REFERENCES languages(code) ON DELETE CASCADE,
        target_term text NOT NULL,
        domain text NOT NULL DEFAULT 'general',
        notes text,
        updated_by text,
        created_at timestamp NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS service_templates (
        id serial PRIMARY KEY,
        slug text NOT NULL UNIQUE,
        domain text NOT NULL,
        title text NOT NULL,
        description text NOT NULL,
        required_documents jsonb NOT NULL DEFAULT '[]'::jsonb,
        form_schema jsonb NOT NULL DEFAULT '[]'::jsonb,
        estimated_days integer NOT NULL DEFAULT 7,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamp NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS documents (
        id serial PRIMARY KEY,
        scope text NOT NULL,
        owner_uid text REFERENCES profiles(uid) ON DELETE CASCADE,
        title text NOT NULL,
        doc_type text NOT NULL,
        domain text NOT NULL DEFAULT 'government',
        language_code text NOT NULL DEFAULT 'en',
        status text NOT NULL DEFAULT 'draft',
        source_url text,
        mime_type text,
        file_size integer,
        file_data_base64 text,
        raw_text text,
        extracted_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        published_at timestamp,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      );
    `);

    // Create document_chunks with vector if extension available, otherwise fallback column
    if (hasPgVector) {
      await client.query(`
        CREATE TABLE IF NOT EXISTS document_chunks (
          id serial PRIMARY KEY,
          document_id integer NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
          chunk_index integer NOT NULL,
          page_number integer NOT NULL DEFAULT 1,
          content text NOT NULL,
          embedding vector(768),
          created_at timestamp NOT NULL DEFAULT now()
        );
      `);
    } else {
      await client.query(`
        CREATE TABLE IF NOT EXISTS document_chunks (
          id serial PRIMARY KEY,
          document_id integer NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
          chunk_index integer NOT NULL,
          page_number integer NOT NULL DEFAULT 1,
          content text NOT NULL,
          embedding text,
          created_at timestamp NOT NULL DEFAULT now()
        );
      `);
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id serial PRIMARY KEY,
        user_uid text NOT NULL REFERENCES profiles(uid) ON DELETE CASCADE,
        title text NOT NULL,
        domain text NOT NULL DEFAULT 'general',
        language_code text NOT NULL DEFAULT 'en',
        status text NOT NULL DEFAULT 'ai_active',
        handover_reason text,
        assigned_agent_uid text,
        resolved_without_agent boolean NOT NULL DEFAULT true,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS messages (
        id serial PRIMARY KEY,
        conversation_id integer NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        sender_role text NOT NULL,
        sender_uid text,
        content text NOT NULL,
        translated_content text,
        detected_language text,
        confidence real,
        citations jsonb NOT NULL DEFAULT '[]'::jsonb,
        suggested_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
        latency_ms integer,
        created_at timestamp NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS feedback (
        id serial PRIMARY KEY,
        message_id integer NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        user_uid text NOT NULL REFERENCES profiles(uid) ON DELETE CASCADE,
        rating text NOT NULL,
        reason text,
        comment text,
        created_at timestamp NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS applications (
        id serial PRIMARY KEY,
        reference_number text NOT NULL UNIQUE,
        user_uid text NOT NULL REFERENCES profiles(uid) ON DELETE CASCADE,
        service_slug text NOT NULL,
        service_title text NOT NULL,
        domain text NOT NULL,
        status text NOT NULL DEFAULT 'submitted',
        current_step integer NOT NULL DEFAULT 2,
        total_steps integer NOT NULL DEFAULT 4,
        form_data jsonb NOT NULL DEFAULT '{}'::jsonb,
        auto_filled_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
        attached_document_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
        language_code text NOT NULL DEFAULT 'en',
        submitted_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS application_events (
        id serial PRIMARY KEY,
        application_id integer NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
        status text NOT NULL,
        title text NOT NULL,
        description text NOT NULL,
        actor_role text NOT NULL DEFAULT 'system',
        created_at timestamp NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS grievances (
        id serial PRIMARY KEY,
        reference_number text NOT NULL UNIQUE,
        user_uid text NOT NULL REFERENCES profiles(uid) ON DELETE CASCADE,
        domain text NOT NULL,
        category text NOT NULL,
        priority text NOT NULL DEFAULT 'normal',
        description text NOT NULL,
        translated_description text,
        language_code text NOT NULL DEFAULT 'en',
        attachment_document_id integer,
        status text NOT NULL DEFAULT 'open',
        assigned_to_uid text,
        assigned_department text,
        sla_due_at timestamp NOT NULL,
        resolution_notes text,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS notifications (
        id serial PRIMARY KEY,
        user_uid text NOT NULL REFERENCES profiles(uid) ON DELETE CASCADE,
        title text NOT NULL,
        body text NOT NULL,
        language_code text NOT NULL DEFAULT 'en',
        channel text NOT NULL DEFAULT 'in_app',
        related_entity_type text,
        related_entity_ref text,
        is_read boolean NOT NULL DEFAULT false,
        created_at timestamp NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS reminders (
        id serial PRIMARY KEY,
        user_uid text NOT NULL REFERENCES profiles(uid) ON DELETE CASCADE,
        title text NOT NULL,
        notes text,
        due_at timestamp NOT NULL,
        channel text NOT NULL DEFAULT 'push',
        source_document_id integer,
        is_completed boolean NOT NULL DEFAULT false,
        created_at timestamp NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS workflows (
        id serial PRIMARY KEY,
        name text NOT NULL,
        description text NOT NULL,
        domain text NOT NULL DEFAULT 'government',
        trigger_type text NOT NULL,
        steps jsonb NOT NULL DEFAULT '[]'::jsonb,
        is_active boolean NOT NULL DEFAULT true,
        created_by text,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS workflow_runs (
        id serial PRIMARY KEY,
        workflow_id integer NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
        trigger_entity_type text NOT NULL,
        trigger_entity_id text NOT NULL,
        user_uid text,
        status text NOT NULL DEFAULT 'running',
        step_logs jsonb NOT NULL DEFAULT '[]'::jsonb,
        started_at timestamp NOT NULL DEFAULT now(),
        completed_at timestamp
      );

      CREATE TABLE IF NOT EXISTS integrations (
        id serial PRIMARY KEY,
        name text NOT NULL,
        adapter_type text NOT NULL,
        domain text NOT NULL DEFAULT 'government',
        endpoint_url text NOT NULL,
        mode text NOT NULL DEFAULT 'sandbox',
        auth_config_encrypted jsonb NOT NULL DEFAULT '{}'::jsonb,
        headers jsonb NOT NULL DEFAULT '{}'::jsonb,
        status text NOT NULL DEFAULT 'sandbox_ready',
        last_tested_at timestamp,
        last_test_message text,
        last_latency_ms integer,
        created_at timestamp NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id serial PRIMARY KEY,
        actor_uid text,
        actor_email text,
        actor_role text,
        action text NOT NULL,
        entity_type text NOT NULL,
        entity_id text,
        details jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamp NOT NULL DEFAULT now()
      );
    `);

    console.log('All 19 tables and indexes verified.');
    client.release();

    console.log('Seeding baseline catalogs (languages, UI translations, service templates, workflows)...');
    await ensureSeedData();

    // Verify row counts
    const verifyClient = await pool.connect();
    const langCount = await verifyClient.query('SELECT count(*) FROM languages');
    const templateCount = await verifyClient.query('SELECT count(*) FROM service_templates');
    const translationCount = await verifyClient.query('SELECT count(*) FROM ui_translations');
    verifyClient.release();

    console.log('\nDatabase setup successfully finished!');
    console.log(`- Languages seeded: ${langCount.rows[0].count}`);
    console.log(`- Service templates seeded: ${templateCount.rows[0].count}`);
    console.log(`- UI translations seeded: ${translationCount.rows[0].count}`);
    console.log('\nYou can now start the Sahayak server with: npm run dev\n');
  } catch (err: any) {
    console.error('Database setup failed:', err);
    if (client) client.release();
    process.exit(1);
  } finally {
    await pool.end();
  }
}

if (process.argv[1]?.endsWith('setup.ts')) {
  setupDatabase();
}

