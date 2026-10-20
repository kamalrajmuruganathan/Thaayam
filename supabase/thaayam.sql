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

-- Colonnes ajoutées après la première version (ré-exécutable)
alter table public.thaayam_parties add column if not exists revanche   text;        -- code de la revanche
alter table public.thaayam_parties add column if not exists reaction   jsonb;       -- { place, texte, n }
alter table public.thaayam_parties add column if not exists reaction_le timestamptz;

create table if not exists public.thaayam_jetons (
  code   text not null references public.thaayam_parties(code) on delete cascade,
  place  integer not null,
  jeton  uuid not null default gen_random_uuid(),
  primary key (code, place)
);

-- Profils (amis, classement, notifications). Pas de compte : un identifiant
-- et un secret gardés sur l'appareil, et un « code ami » de 6 caractères à partager.
create table if not exists public.thaayam_joueurs (
  id       uuid primary key default gen_random_uuid(),
  secret   uuid not null default gen_random_uuid(),
  code_ami text not null unique,
  pseudo   text not null,
  cree_le  timestamptz not null default now(),
  vu_le    timestamptz not null default now()
);
alter table public.thaayam_jetons add column if not exists joueur uuid references public.thaayam_joueurs(id) on delete set null;

create table if not exists public.thaayam_amis (
  joueur uuid not null references public.thaayam_joueurs(id) on delete cascade,
  ami    uuid not null references public.thaayam_joueurs(id) on delete cascade,
  primary key (joueur, ami)
);
create table if not exists public.thaayam_invitations (
  pour    uuid not null references public.thaayam_joueurs(id) on delete cascade,
  code    text not null references public.thaayam_parties(code) on delete cascade,
  de      uuid not null references public.thaayam_joueurs(id) on delete cascade,
  cree_le timestamptz not null default now(),
  primary key (pour, code)
);
-- Résultats des parties en ligne terminées (gardés après le ménage des parties)
create table if not exists public.thaayam_resultats (
  code    text not null,
  joueur  uuid not null references public.thaayam_joueurs(id) on delete cascade,
  gagne   boolean not null,
  fini_le timestamptz not null default now(),
  primary key (code, joueur)
);
-- Abonnements aux notifications (navigateur ou téléphone), un par appareil
create table if not exists public.thaayam_notifs (
  joueur     uuid not null references public.thaayam_joueurs(id) on delete cascade,
  appareil   text not null,
  type       text not null check (type in ('web', 'expo')),
  abonnement jsonb not null,
  langue     text not null default 'fr',
  maj_le     timestamptz not null default now(),
  primary key (joueur, appareil)
);
-- Réglages privés (adresse et secret du notificateur, clés des notifications web)
create table if not exists public.thaayam_config (
  cle    text primary key,
  valeur text not null
);

alter table public.thaayam_parties enable row level security;
alter table public.thaayam_jetons  enable row level security;
alter table public.thaayam_joueurs enable row level security;
alter table public.thaayam_amis enable row level security;
alter table public.thaayam_invitations enable row level security;
alter table public.thaayam_resultats enable row level security;
alter table public.thaayam_notifs enable row level security;
alter table public.thaayam_config enable row level security;
revoke all on public.thaayam_joueurs, public.thaayam_amis, public.thaayam_invitations,
  public.thaayam_resultats, public.thaayam_notifs, public.thaayam_config from anon, authenticated;

-- Lecture des parties ouverte (il faut connaître le code de 5 lettres).
-- Aucune écriture directe : tout passe par les fonctions ci-dessous.
drop policy if exists thaayam_parties_lecture on public.thaayam_parties;
create policy thaayam_parties_lecture on public.thaayam_parties
  for select to anon, authenticated using (true);

revoke all on public.thaayam_parties from anon, authenticated;
grant select on public.thaayam_parties to anon, authenticated;
revoke all on public.thaayam_jetons from anon, authenticated;

-- ---------------------------------------------------------------------
-- Ménage automatique : efface les vieilles parties (et leurs jetons).
--   * terminées depuis plus d'un jour ;
--   * jamais commencées après un jour ;
--   * en cours mais sans aucun coup depuis 7 jours.
-- Appelé à chaque création de partie, et chaque nuit si pg_cron est actif.
-- Renvoie le nombre de parties effacées.
-- ---------------------------------------------------------------------
create or replace function public.thaayam_menage()
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_nb integer;
begin
  delete from thaayam_parties
   where (statut = 'finie'    and maj_le < now() - interval '1 day')
      or (statut = 'attente'  and maj_le < now() - interval '1 day')
      or (statut = 'en_cours' and maj_le < now() - interval '7 days');
  get diagnostics v_nb = row_count;
  return v_nb;
end $$;

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
  perform thaayam_menage();
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
  if pg_column_size(p_etat) > 60000 then raise exception 'État trop gros'; end if;
  update thaayam_parties
     set etat = p_etat,
         version = version + 1,
         statut = case when p_etat ->> 'phase' = 'fini' then 'finie' else 'en_cours' end,
         maj_le = now()
   where code = p_code;
  -- Fin de partie : résultat de chaque joueur qui a un profil (classement entre amis)
  if p_etat ->> 'phase' = 'fini' then
    insert into thaayam_resultats (code, joueur, gagne)
      select p_code, j.joueur, j.place = (p_etat ->> 'gagnant')::int
        from thaayam_jetons j where j.code = p_code and j.joueur is not null
      on conflict do nothing;
  end if;
  return v_partie.version + 1;
end $$;

-- ---------------------------------------------------------------------
-- Revanche : à la fin d'une partie, n'importe quel joueur crée une
-- nouvelle partie avec les mêmes joueurs (même ordre, mêmes jetons) et
-- les mêmes règles. Si elle existe déjà, renvoie simplement son code.
-- ---------------------------------------------------------------------
create or replace function public.thaayam_revanche(p_code text, p_jeton uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_partie thaayam_parties%rowtype;
  v_code   text;
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
begin
  select * into v_partie from thaayam_parties where code = p_code for update;
  if not found then raise exception 'Partie introuvable'; end if;
  if not exists (select 1 from thaayam_jetons where code = p_code and jeton = p_jeton) then
    raise exception 'Tu ne fais pas partie de cette partie';
  end if;
  if v_partie.statut <> 'finie' then raise exception 'La partie n''est pas terminée'; end if;
  if v_partie.revanche is not null and exists (select 1 from thaayam_parties where code = v_partie.revanche) then
    return v_partie.revanche;
  end if;
  loop
    v_code := '';
    for i in 1..5 loop
      v_code := v_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from thaayam_parties where code = v_code);
  end loop;
  insert into thaayam_parties (code, regles, joueurs) values (v_code, v_partie.regles, v_partie.joueurs);
  insert into thaayam_jetons (code, place, jeton, joueur)
    select v_code, place, jeton, joueur from thaayam_jetons where code = p_code;
  update thaayam_parties set revanche = v_code, maj_le = now() where code = p_code;
  return v_code;
end $$;

-- ---------------------------------------------------------------------
-- Messages rapides : un joueur envoie une réaction choisie dans une liste
-- fixe (pas de texte libre). Au plus une par seconde et par partie.
-- ---------------------------------------------------------------------
create or replace function public.thaayam_reagir(p_code text, p_jeton uuid, p_texte text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_place integer;
  v_n     integer;
begin
  if p_texte is null or not (p_texte = any (array['👏', '😂', '😮', '😡', '🔥', '🙏',
      'Bien joué !', 'Pas de chance !', 'Vite !', 'Bravo !', 'Oh non !', 'Merci !'])) then
    raise exception 'Message non autorisé';
  end if;
  select place into v_place from thaayam_jetons where code = p_code and jeton = p_jeton;
  if v_place is null then raise exception 'Tu ne fais pas partie de cette partie'; end if;
  select coalesce((reaction ->> 'n')::int, 0) + 1 into v_n from thaayam_parties
   where code = p_code and (reaction_le is null or reaction_le < now() - interval '1 second') for update;
  if not found then raise exception 'Doucement : un message par seconde'; end if;
  update thaayam_parties
     set reaction = jsonb_build_object('place', v_place, 'texte', p_texte, 'n', v_n),
         reaction_le = now()
   where code = p_code;
end $$;


-- =====================================================================
-- Amis, invitations, classement et notifications
-- =====================================================================

-- Vérifie le couple (identifiant, secret) d'un profil (usage interne).
create or replace function public.thaayam_moi(p_joueur uuid, p_secret uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_joueur is null or not exists (select 1 from thaayam_joueurs where id = p_joueur and secret = p_secret) then
    raise exception 'Profil inconnu';
  end if;
end $$;

-- Crée le profil de l'appareil (ou met à jour son pseudo) : renvoie { id, secret, code_ami }
create or replace function public.thaayam_profil(p_joueur uuid, p_secret uuid, p_pseudo text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_nom  text := left(btrim(coalesce(p_pseudo, '')), 20);
  v_j    thaayam_joueurs%rowtype;
  v_code text;
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
begin
  if v_nom = '' then raise exception 'Pseudo obligatoire'; end if;
  select * into v_j from thaayam_joueurs where id = p_joueur and secret = p_secret;
  if found then
    update thaayam_joueurs set pseudo = v_nom, vu_le = now() where id = v_j.id;
    return jsonb_build_object('id', v_j.id, 'secret', v_j.secret, 'code_ami', v_j.code_ami);
  end if;
  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from thaayam_joueurs where code_ami = v_code);
  end loop;
  insert into thaayam_joueurs (code_ami, pseudo) values (v_code, v_nom) returning * into v_j;
  return jsonb_build_object('id', v_j.id, 'secret', v_j.secret, 'code_ami', v_j.code_ami);
end $$;

-- Relie la place d'un joueur dans une partie à son profil (pour le classement et les notifications)
create or replace function public.thaayam_lier(p_code text, p_jeton uuid, p_joueur uuid, p_secret uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform thaayam_moi(p_joueur, p_secret);
  update thaayam_jetons set joueur = p_joueur where code = p_code and jeton = p_jeton;
  delete from thaayam_invitations where pour = p_joueur and code = p_code;
end $$;

-- Ajoute un ami avec son code ami (l'amitié va dans les deux sens)
create or replace function public.thaayam_ajouter_ami(p_joueur uuid, p_secret uuid, p_code_ami text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_ami thaayam_joueurs%rowtype;
begin
  perform thaayam_moi(p_joueur, p_secret);
  select * into v_ami from thaayam_joueurs where code_ami = upper(btrim(coalesce(p_code_ami, '')));
  if not found then raise exception 'Code ami introuvable'; end if;
  if v_ami.id = p_joueur then raise exception 'C''est ton propre code ami'; end if;
  if (select count(*) from thaayam_amis where joueur = p_joueur) >= 50 then
    raise exception 'Trop d''amis (50 au maximum)';
  end if;
  insert into thaayam_amis (joueur, ami) values (p_joueur, v_ami.id), (v_ami.id, p_joueur) on conflict do nothing;
  return jsonb_build_object('id', v_ami.id, 'pseudo', v_ami.pseudo);
end $$;

create or replace function public.thaayam_retirer_ami(p_joueur uuid, p_secret uuid, p_ami uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform thaayam_moi(p_joueur, p_secret);
  delete from thaayam_amis where (joueur = p_joueur and ami = p_ami) or (joueur = p_ami and ami = p_joueur);
end $$;

-- Invite un ami dans une partie en attente
create or replace function public.thaayam_inviter(p_joueur uuid, p_secret uuid, p_ami uuid, p_code text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform thaayam_moi(p_joueur, p_secret);
  if not exists (select 1 from thaayam_amis where joueur = p_joueur and ami = p_ami) then
    raise exception 'Ce joueur n''est pas dans tes amis';
  end if;
  if not exists (select 1 from thaayam_parties where code = p_code and statut = 'attente') then
    raise exception 'La partie a déjà commencé';
  end if;
  if not exists (select 1 from thaayam_jetons where code = p_code and joueur = p_joueur) then
    raise exception 'Tu ne fais pas partie de cette partie';
  end if;
  insert into thaayam_invitations (pour, code, de) values (p_ami, p_code, p_joueur) on conflict do nothing;
end $$;

-- Tout ce qu'affiche l'accueil : amis, invitations reçues, classement (moi + mes amis)
create or replace function public.thaayam_social(p_joueur uuid, p_secret uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  perform thaayam_moi(p_joueur, p_secret);
  update thaayam_joueurs set vu_le = now() where id = p_joueur;
  return jsonb_build_object(
    'amis', coalesce((
      select jsonb_agg(jsonb_build_object('id', j.id, 'pseudo', j.pseudo, 'code_ami', j.code_ami, 'vu_le', j.vu_le)
                       order by lower(j.pseudo))
        from thaayam_amis a join thaayam_joueurs j on j.id = a.ami
       where a.joueur = p_joueur), '[]'::jsonb),
    'invitations', coalesce((
      select jsonb_agg(jsonb_build_object('code', i.code, 'de', j.pseudo, 'cree_le', i.cree_le) order by i.cree_le desc)
        from thaayam_invitations i
        join thaayam_joueurs j on j.id = i.de
        join thaayam_parties p on p.code = i.code
       where i.pour = p_joueur and p.statut = 'attente'), '[]'::jsonb),
    'classement', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.id, 'pseudo', x.pseudo, 'moi', x.id = p_joueur,
               'parties', (select count(*) from thaayam_resultats r where r.joueur = x.id),
               'victoires', (select count(*) from thaayam_resultats r where r.joueur = x.id and r.gagne)))
        from (select id, pseudo from thaayam_joueurs where id = p_joueur
              union
              select j.id, j.pseudo from thaayam_amis a join thaayam_joueurs j on j.id = a.ami where a.joueur = p_joueur) x
    ), '[]'::jsonb)
  );
end $$;

-- Abonnement aux notifications d'un appareil (p_abonnement null = se désabonner)
create or replace function public.thaayam_abonner(p_joueur uuid, p_secret uuid, p_appareil text, p_type text,
                                                  p_abonnement jsonb, p_langue text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform thaayam_moi(p_joueur, p_secret);
  if p_abonnement is null then
    delete from thaayam_notifs where joueur = p_joueur and appareil = p_appareil;
    return;
  end if;
  if p_type not in ('web', 'expo') or pg_column_size(p_abonnement) > 4000 or length(coalesce(p_appareil, '')) not between 1 and 64 then
    raise exception 'Abonnement invalide';
  end if;
  insert into thaayam_notifs (joueur, appareil, type, abonnement, langue)
    values (p_joueur, p_appareil, p_type, p_abonnement, coalesce(nullif(left(p_langue, 5), ''), 'fr'))
    on conflict (joueur, appareil) do update
      set type = excluded.type, abonnement = excluded.abonnement, langue = excluded.langue, maj_le = now();
end $$;

-- Clé publique des notifications web (créée par la fonction Edge au premier envoi)
create or replace function public.thaayam_cle_notifs()
returns text
language sql security definer set search_path = public
as $$ select valeur from thaayam_config where cle = 'vapid_public' $$;

-- Réglages du notificateur (adresse de la fonction Edge et secret partagé), créés une fois
insert into public.thaayam_config (cle, valeur) values
  ('url_notifier', 'https://zxhxevucpuudknyfidla.supabase.co/functions/v1/thaayam-notifier'),
  ('secret_notifier', gen_random_uuid()::text)
on conflict (cle) do nothing;

-- Appelle la fonction Edge « thaayam-notifier » (extension pg_net). Ne bloque jamais le jeu.
create or replace function public.thaayam_envoyer_notif(p_corps jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_url    text;
  v_secret text;
begin
  select valeur into v_url from thaayam_config where cle = 'url_notifier';
  select valeur into v_secret from thaayam_config where cle = 'secret_notifier';
  if v_url is null or v_secret is null then return; end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') then return; end if;
  execute 'select net.http_post(url := $1, body := $2, headers := $3)'
    using v_url, p_corps, jsonb_build_object('Content-Type', 'application/json', 'x-thaayam', v_secret);
exception when others then
  raise notice 'Notification non envoyée : %', sqlerrm;
end $$;

-- « C'est ton tour » : quand le tour passe à un autre joueur
create or replace function public.thaayam_trig_tour()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_tour   integer;
  v_joueur uuid;
begin
  if new.statut <> 'en_cours' or new.etat is null then return new; end if;
  v_tour := (new.etat ->> 'tour')::int;
  if old.statut = 'en_cours' and old.etat is not null and (old.etat ->> 'tour')::int = v_tour then return new; end if;
  select joueur into v_joueur from thaayam_jetons where code = new.code and place = v_tour;
  if v_joueur is null or not exists (select 1 from thaayam_notifs where joueur = v_joueur) then return new; end if;
  perform thaayam_envoyer_notif(jsonb_build_object('type', 'tour', 'joueur', v_joueur, 'code', new.code));
  return new;
end $$;
drop trigger if exists thaayam_tour on public.thaayam_parties;
create trigger thaayam_tour after update on public.thaayam_parties
  for each row execute function public.thaayam_trig_tour();

-- « X t'invite » : quand un ami envoie une invitation
create or replace function public.thaayam_trig_invitation()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if exists (select 1 from thaayam_notifs where joueur = new.pour) then
    perform thaayam_envoyer_notif(jsonb_build_object('type', 'invitation', 'joueur', new.pour, 'code', new.code, 'de', new.de));
  end if;
  return new;
end $$;
drop trigger if exists thaayam_invitation on public.thaayam_invitations;
create trigger thaayam_invitation after insert on public.thaayam_invitations
  for each row execute function public.thaayam_trig_invitation();

-- Extension pg_net (envoi des notifications). Si elle n'est pas disponible, le jeu marche quand même.
do $$
begin
  create extension if not exists pg_net;
exception when others then
  raise notice 'pg_net non activée : %', sqlerrm;
end $$;

revoke all on function public.thaayam_menage() from public, anon, authenticated;
revoke all on function public.thaayam_creer(jsonb, text) from public;
revoke all on function public.thaayam_rejoindre(text, text) from public;
revoke all on function public.thaayam_demarrer(text, uuid, jsonb) from public;
revoke all on function public.thaayam_jouer(text, uuid, integer, jsonb) from public;
revoke all on function public.thaayam_revanche(text, uuid) from public;
revoke all on function public.thaayam_reagir(text, uuid, text) from public;
grant execute on function public.thaayam_creer(jsonb, text) to anon, authenticated;
grant execute on function public.thaayam_rejoindre(text, text) to anon, authenticated;
grant execute on function public.thaayam_demarrer(text, uuid, jsonb) to anon, authenticated;
grant execute on function public.thaayam_jouer(text, uuid, integer, jsonb) to anon, authenticated;
grant execute on function public.thaayam_revanche(text, uuid) to anon, authenticated;
grant execute on function public.thaayam_reagir(text, uuid, text) to anon, authenticated;
revoke all on function public.thaayam_moi(uuid, uuid) from public, anon, authenticated;
revoke all on function public.thaayam_envoyer_notif(jsonb) from public, anon, authenticated;
revoke all on function public.thaayam_trig_tour() from public, anon, authenticated;
revoke all on function public.thaayam_trig_invitation() from public, anon, authenticated;
revoke all on function public.thaayam_profil(uuid, uuid, text) from public;
revoke all on function public.thaayam_lier(text, uuid, uuid, uuid) from public;
revoke all on function public.thaayam_ajouter_ami(uuid, uuid, text) from public;
revoke all on function public.thaayam_retirer_ami(uuid, uuid, uuid) from public;
revoke all on function public.thaayam_inviter(uuid, uuid, uuid, text) from public;
revoke all on function public.thaayam_social(uuid, uuid) from public;
revoke all on function public.thaayam_abonner(uuid, uuid, text, text, jsonb, text) from public;
revoke all on function public.thaayam_cle_notifs() from public;
grant execute on function public.thaayam_profil(uuid, uuid, text) to anon, authenticated;
grant execute on function public.thaayam_lier(text, uuid, uuid, uuid) to anon, authenticated;
grant execute on function public.thaayam_ajouter_ami(uuid, uuid, text) to anon, authenticated;
grant execute on function public.thaayam_retirer_ami(uuid, uuid, uuid) to anon, authenticated;
grant execute on function public.thaayam_inviter(uuid, uuid, uuid, text) to anon, authenticated;
grant execute on function public.thaayam_social(uuid, uuid) to anon, authenticated;
grant execute on function public.thaayam_abonner(uuid, uuid, text, text, jsonb, text) to anon, authenticated;
grant execute on function public.thaayam_cle_notifs() to anon, authenticated;

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

-- Ménage chaque nuit (3 h 17) si l'extension pg_cron est activée
-- (Supabase : Database → Extensions → pg_cron). Sinon, rien ne se passe :
-- le ménage se fait quand même à chaque création de partie.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('thaayam-menage', '17 3 * * *', 'select public.thaayam_menage()');
  end if;
exception when others then
  raise notice 'Ménage de nuit non programmé : %', sqlerrm;
end $$;

-- =====================================================================
-- Discussion pendant la partie (messages écrits et emojis)
-- =====================================================================
create table if not exists public.thaayam_messages (
  id      bigint generated always as identity primary key,
  code    text not null references public.thaayam_parties(code) on delete cascade,
  place   integer not null,
  texte   text not null check (char_length(texte) between 1 and 300),
  cree_le timestamptz not null default now()
);
create index if not exists thaayam_messages_code on public.thaayam_messages (code, id);
alter table public.thaayam_messages enable row level security;
-- Lecture ouverte à qui connaît le code de la partie (comme la partie elle-même) ; écriture par la fonction seulement
drop policy if exists thaayam_messages_lecture on public.thaayam_messages;
create policy thaayam_messages_lecture on public.thaayam_messages for select to anon, authenticated using (true);
revoke all on public.thaayam_messages from anon, authenticated;
grant select on public.thaayam_messages to anon, authenticated;

-- Écrire un message : seulement un joueur de la partie, au plus un message par seconde.
-- On garde les 200 derniers messages de chaque partie.
create or replace function public.thaayam_ecrire(p_code text, p_jeton uuid, p_texte text)
returns bigint
language plpgsql security definer set search_path = public
as $$
declare
  v_place integer;
  v_texte text := left(btrim(regexp_replace(coalesce(p_texte, ''), '[[:cntrl:]]', ' ', 'g')), 300);
  v_id    bigint;
begin
  if v_texte = '' then raise exception 'Message vide'; end if;
  select place into v_place from thaayam_jetons where code = p_code and jeton = p_jeton;
  if v_place is null then raise exception 'Tu ne fais pas partie de cette partie'; end if;
  if exists (select 1 from thaayam_messages where code = p_code and place = v_place and cree_le > now() - interval '1 second') then
    raise exception 'Doucement : un message par seconde';
  end if;
  insert into thaayam_messages (code, place, texte) values (p_code, v_place, v_texte) returning id into v_id;
  delete from thaayam_messages where code = p_code and id <= v_id - 200;
  return v_id;
end $$;
revoke all on function public.thaayam_ecrire(text, uuid, text) from public;
grant execute on function public.thaayam_ecrire(text, uuid, text) to anon, authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') and not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'thaayam_messages'
  ) then
    alter publication supabase_realtime add table public.thaayam_messages;
  end if;
end $$;
