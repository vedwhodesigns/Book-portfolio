-- ================================================================
--  Book Portfolio – Supabase Schema
--  Run this entire file in the Supabase SQL Editor:
--  Dashboard → SQL Editor → New query → paste → Run
-- ================================================================


-- ----------------------------------------------------------------
-- 1. BOOKS TABLE
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS books (
  id          SERIAL PRIMARY KEY,
  title       TEXT        NOT NULL,
  author      TEXT        NOT NULL,
  genre       TEXT        NOT NULL,
  year        INTEGER     NOT NULL,
  pages       INTEGER     NOT NULL,
  rating      NUMERIC(3,1) NOT NULL CHECK (rating >= 0 AND rating <= 5),
  color       TEXT[]      NOT NULL DEFAULT ARRAY['#2c1810','#6b3d2a'],
  cover_url   TEXT,                         -- Supabase Storage public URL (nullable)
  description TEXT        NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security: anyone can READ books
ALTER TABLE books ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_books"
  ON books FOR SELECT
  TO anon, authenticated
  USING (true);


-- ----------------------------------------------------------------
-- 2. CONTACT MESSAGES TABLE
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contact_messages (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  message    TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: anyone can INSERT (submit form); only authenticated admins can SELECT
ALTER TABLE contact_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone_can_submit_contact"
  ON contact_messages FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "auth_reads_contacts"
  ON contact_messages FOR SELECT
  TO authenticated
  USING (true);


-- ----------------------------------------------------------------
-- 3. STORAGE BUCKET  (book-covers)
-- ----------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'book-covers',
  'book-covers',
  true,
  5242880,                                  -- 5 MB max per file
  ARRAY['image/jpeg','image/png','image/webp','image/avif']
)
ON CONFLICT (id) DO NOTHING;

-- Anyone can view cover images
CREATE POLICY "public_view_book_covers"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'book-covers');

-- Only authenticated users (admins) can upload / delete
CREATE POLICY "auth_manage_book_covers"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'book-covers');

CREATE POLICY "auth_delete_book_covers"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'book-covers');


-- ----------------------------------------------------------------
-- 4. SEED DATA  (12 starter books)
-- ----------------------------------------------------------------
INSERT INTO books (title, author, genre, year, pages, rating, color, description) VALUES

('The Great Gatsby',
 'F. Scott Fitzgerald',
 'Classic Fiction', 1925, 180, 4.5,
 ARRAY['#8b2635','#c0392b'],
 'A portrait of the Jazz Age in all of its excess and decadence, this novel follows the mysterious millionaire Jay Gatsby and his obsession with the beautiful Daisy Buchanan. A timeless meditation on the American Dream, class, and the impossibility of recapturing the past.'),

('1984',
 'George Orwell',
 'Dystopian', 1949, 328, 5.0,
 ARRAY['#1a3a5c','#2980b9'],
 'Winston Smith lives in a totalitarian superstate ruled by Big Brother. He secretly rebels against the Party and falls in love, only to face the terrifying machinery of state control. A chilling and profoundly prescient vision of authoritarianism, surveillance, and truth.'),

('Dune',
 'Frank Herbert',
 'Science Fiction', 1965, 688, 5.0,
 ARRAY['#5c4a1a','#d4a017'],
 'Set in a distant future amidst a feudal interstellar society, Dune tells the story of young Paul Atreides as his family accepts control of the desert planet Arrakis, the only source of the universe''s most valuable substance. An epic saga of politics, religion, ecology, and power.'),

('Sapiens',
 'Yuval Noah Harari',
 'Non-Fiction', 2011, 443, 4.5,
 ARRAY['#1a5c3a','#27ae60'],
 'A sweeping history of humankind, from the emergence of Homo sapiens in Africa to the present day. Harari examines how biology, culture, and ideas shaped human societies, raising fundamental questions about what it means to be human.'),

('To Kill a Mockingbird',
 'Harper Lee',
 'Classic Fiction', 1960, 281, 5.0,
 ARRAY['#4a3560','#8e44ad'],
 'Narrated through the eyes of young Scout Finch, this novel explores racial injustice and moral growth in the American South. Her father, Atticus Finch, defends a Black man falsely accused of a crime—a role that would cement him as one of literature''s great moral heroes.'),

('Thinking, Fast and Slow',
 'Daniel Kahneman',
 'Non-Fiction', 2011, 499, 4.0,
 ARRAY['#2c3e50','#34495e'],
 'Nobel laureate Daniel Kahneman distills decades of research into the two systems of thinking: fast, intuitive, and emotional; and slow, deliberate, and logical. A revelatory tour through the science of the mind and the nature of human judgment.'),

('The Alchemist',
 'Paulo Coelho',
 'Fiction', 1988, 208, 4.0,
 ARRAY['#7d4a00','#d48000'],
 'A young Andalusian shepherd boy dreams of finding a worldly treasure buried near the Egyptian pyramids. His quest becomes a deeply personal journey about following your dreams, listening to your heart, and finding your Personal Legend.'),

('Atomic Habits',
 'James Clear',
 'Self-Help', 2018, 320, 4.5,
 ARRAY['#1a4a6b','#1f6fa3'],
 'An easy and proven way to build good habits and break bad ones. James Clear distills the most fundamental information about habit formation and provides a simple, step-by-step plan for making lasting changes through the power of tiny, incremental improvements.'),

('The Hobbit',
 'J.R.R. Tolkien',
 'Fantasy', 1937, 310, 5.0,
 ARRAY['#2d5a1b','#4a8f2d'],
 'Bilbo Baggins, a homebody hobbit, is swept into an epic quest to reclaim a dwarf kingdom from the dragon Smaug. Tolkien''s beloved prelude to The Lord of the Rings is a warm, adventurous tale of courage, friendship, and the unexpected heroism of the small.'),

('Educated',
 'Tara Westover',
 'Memoir', 2018, 352, 4.5,
 ARRAY['#5c2a35','#9b4555'],
 'Born to survivalists in the mountains of Idaho, Tara Westover never set foot in a classroom until age 17. Her memoir is an account of the struggle to reconcile a violent, controlling family with her own thirst for knowledge—a testament to the transformative power of education.'),

('Project Hail Mary',
 'Andy Weir',
 'Science Fiction', 2021, 476, 5.0,
 ARRAY['#1a2a5c','#2c4499'],
 'Ryland Grace wakes up alone on a spacecraft with no memory of who he is or why he''s there. The answer he pieces together is staggering: he''s humanity''s last hope against an extinction-level threat. A thrillingly inventive and warmhearted science fiction adventure.'),

('Man''s Search for Meaning',
 'Viktor E. Frankl',
 'Non-Fiction', 1946, 165, 5.0,
 ARRAY['#3a2a1a','#6b4a30'],
 'A psychiatrist and Holocaust survivor describes his experiences in Nazi concentration camps and outlines his psychotherapeutic method—logotherapy—in this profoundly moving account. Frankl argues that we cannot avoid suffering but can choose how to cope with it and find meaning within.');
