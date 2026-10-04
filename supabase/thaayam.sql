-- =====================================================================
-- Thaayam en ligne — à exécuter UNE fois dans Supabase (SQL Editor).
-- Tout est préfixé thaayam_ : aucun conflit avec les tables existantes.
-- Pas de compte nécessaire : chaque joueur reçoit un jeton secret
-- (gardé sur son appareil) qui prouve sa place dans la partie.
-- =====================================================================

create table if not exists public.thaayam_parties (
  code      text primary key,
  regles    jsonb not null,
  joueurs   jsonb not null default '[]'::jsonb,  -- [{ "nom": "..." }]
  etat      jsonb,                               -- état complet du jeu
  version   integer not null default 0,
  statut    text not null default 'attente'
            check (statut in ('attente', 'en_cours', 'finie')),
  cree_le   timestamptz not null default now(),
  maj_le    timestamptz not null default now()
);

create table if not exists public.thaayam_jetons (
  code   text not null references public.thaayam_parties(code) on delete cascade,
  place  integer not null,
  jeton  uuid not null default gen_random_uuid(),
  primary key (code, place)
);

alter table public.thaayam_parties enable row level security;
alter table public.thaayam_jetons  enable row level security;

-- Lecture des parties ouverte (il faut connaître le code de 5 lettres).
-- Aucune écriture directe : tout passe par les fonctions ci-dessous.
drop policy if exists thaayam_parties_lecture on public.thaayam_parties;
create policy thaayam_parties_lecture on public.thaayam_parties
  for select to anon, authenticated using (true);

revoke all on public.thaayam_parties from anon, authenticated;
grant select on public.thaayam_parties to anon, authenticated;
revoke all on public.thaayam_jetons from anon, authenticated;

-- ---------------------------------------------------------------------
-- Créer une partie : renvoie { code, place, jeton }
-- ---------------------------------------------------------------------
create or replace function public.thaayam_creer(p_regles jsonb, p_nom text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_code  text;
  v_jeton uuid;
  v_nom   text := left(btrim(coalesce(p_nom, '')), 20);
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
begin
  if v_nom = '' then raise exception 'Pseudo obligatoire'; end if;
  if p_regles is null or jsonb_typeof(p_regles) <> 'object' or pg_column_size(p_regles) > 4000 then
    raise exception 'Règles invalides';
  end if;
  loop
    v_code := '';
    for i in 1..5 loop
      v_code := v_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from thaayam_parties where code = v_code);
  end loop;
  insert into thaayam_parties (code, regles, joueurs)
    values (v_code, p_regles, jsonb_build_array(jsonb_build_object('nom', v_nom)));
  insert into thaayam_jetons (code, place) values (v_code, 0) returning jeton into v_jeton;
  return jsonb_build_object('code', v_code, 'place', 0, 'jeton', v_jeton);
end $$;

-- ---------------------------------------------------------------------
-- Rejoindre une partie en attente (4 joueurs maximum)
-- ---------------------------------------------------------------------
create or replace function public.thaayam_rejoindre(p_code text, p_nom text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_partie thaayam_parties%rowtype;
  v_place  integer;
  v_jeton  uuid;
  v_nom    text := left(btrim(coalesce(p_nom, '')), 20);
begin
  if v_nom = '' then raise exception 'Pseudo obligatoire'; end if;
  select * into v_partie from thaayam_parties where code = upper(btrim(p_code)) for update;
  if not found then raise exception 'Partie introuvable'; end if;
  if v_partie.statut <> 'attente' then raise exception 'La partie a déjà commencé'; end if;
  v_place := jsonb_array_length(v_partie.joueurs);
  if v_place >= 4 then raise exception 'La partie est complète (4 joueurs)'; end if;
  update thaayam_parties
     set joueurs = joueurs || jsonb_build_array(jsonb_build_object('nom', v_nom)),
         maj_le = now()
   where code = v_partie.code;
  insert into thaayam_jetons (code, place) values (v_partie.code, v_place) returning jeton into v_jeton;
  return jsonb_build_object('code', v_partie.code, 'place', v_place, 'jeton', v_jeton);
end $$;

-- ---------------------------------------------------------------------
-- Démarrer (créateur seulement) avec l'état initial calculé par l'appli
-- ---------------------------------------------------------------------
create or replace function public.thaayam_demarrer(p_code text, p_jeton uuid, p_etat jsonb)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_partie thaayam_parties%rowtype;
begin
  select * into v_partie from thaayam_parties where code = p_code for update;
  if not found then raise exception 'Partie introuvable'; end if;
  if not exists (select 1 from thaayam_jetons where code = p_code and place = 0 and jeton = p_jeton) then
    raise exception 'Seul le créateur peut lancer la partie';
  end if;
  if v_partie.statut <> 'attente' then raise exception 'La partie a déjà commencé'; end if;
  if jsonb_array_length(v_partie.joueurs) < 2 then raise exception 'Il faut au moins 2 joueurs'; end if;
  if jsonb_array_length(p_etat -> 'joueurs') <> jsonb_array_length(v_partie.joueurs) then
    raise exception 'État invalide';
  end if;
  update thaayam_parties
     set etat = p_etat, statut = 'en_cours', version = 1, maj_le = now()
   where code = p_code;
  return 1;
end $$;

-- ---------------------------------------------------------------------
-- Jouer une action : seul le joueur dont c'est le tour peut écrire,
-- et seulement sur la dernière version (évite les coups en double).
-- ---------------------------------------------------------------------
create or replace function public.thaayam_jouer(p_code text, p_jeton uuid, p_version integer, p_etat jsonb)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_partie thaayam_parties%rowtype;
  v_place  integer;
begin
  select * into v_partie from thaayam_parties where code = p_code for update;
  if not found then raise exception 'Partie introuvable'; end if;
  select place into v_place from thaayam_jetons where code = p_code and jeton = p_jeton;
  if v_place is null then raise exception 'Tu ne fais pas partie de cette partie'; end if;
  if v_partie.statut <> 'en_cours' then raise exception 'La partie n''est pas en cours'; end if;
  if v_partie.version <> p_version then raise exception 'Partie modifiée entre-temps, réessaie'; end if;
  if (v_partie.etat ->> 'tour')::int <> v_place then raise exception 'Ce n''est pas ton tour'; end if;
  if pg_column_size(p_etat) > 20000 then raise exception 'État trop gros'; end if;
  update thaayam_parties
     set etat = p_etat,
         version = version + 1,
         statut = case when p_etat ->> 'phase' = 'fini' then 'finie' else 'en_cours' end,
         maj_le = now()
   where code = p_code;
  return v_partie.version + 1;
end $$;

revoke all on function public.thaayam_creer(jsonb, text) from public;
revoke all on function public.thaayam_rejoindre(text, text) from public;
revoke all on function public.thaayam_demarrer(text, uuid, jsonb) from public;
revoke all on function public.thaayam_jouer(text, uuid, integer, jsonb) from public;
grant execute on function public.thaayam_creer(jsonb, text) to anon, authenticated;
grant execute on function public.thaayam_rejoindre(text, text) to anon, authenticated;
grant execute on function public.thaayam_demarrer(text, uuid, jsonb) to anon, authenticated;
grant execute on function public.thaayam_jouer(text, uuid, integer, jsonb) to anon, authenticated;

-- Temps réel : les autres joueurs voient chaque coup instantanément.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'thaayam_parties'
  ) then
    alter publication supabase_realtime add table public.thaayam_parties;
  end if;
end $$;
