-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Profiles table (one per user, stores display name)
create table profiles (
  id uuid references auth.users on delete cascade primary key,
  username text not null,
  created_at timestamptz default now()
);

-- Tasks table
create table tasks (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  text text not null,
  done boolean default false,
  priority text check (priority in ('urgent', 'normal')) default 'normal',
  date text not null,
  done_at timestamptz,
  deleted boolean default false,
  created_at timestamptz default now()
);

-- Team tasks table
create table team_tasks (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  text text not null,
  assignee text not null,
  done boolean default false,
  done_at timestamptz,
  deleted boolean default false,
  created_at timestamptz default now()
);

-- Goals table
create table goals (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  text text not null,
  done boolean default false,
  week text not null,
  done_at timestamptz,
  deleted boolean default false,
  created_at timestamptz default now()
);

-- Jobs table
create table jobs (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  link text not null,
  note text default '',
  status text check (status in ('New', 'Shortlisted', 'Proposal Sent', 'Rejected')) default 'New',
  deleted boolean default false,
  created_at timestamptz default now()
);

-- Notes table (one note per user per day)
create table notes (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  content text default '',
  date text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, date)
);

-- Members table (team members per user)
create table members (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  name text not null,
  created_at timestamptz default now(),
  unique(user_id, name)
);

-- Row Level Security (each user sees only their own data)
alter table profiles enable row level security;
alter table tasks enable row level security;
alter table team_tasks enable row level security;
alter table goals enable row level security;
alter table jobs enable row level security;
alter table notes enable row level security;
alter table members enable row level security;

create policy "Users manage own profile" on profiles for all using (auth.uid() = id);
create policy "Users manage own tasks" on tasks for all using (auth.uid() = user_id);
create policy "Users manage own team_tasks" on team_tasks for all using (auth.uid() = user_id);
create policy "Users manage own goals" on goals for all using (auth.uid() = user_id);
create policy "Users manage own jobs" on jobs for all using (auth.uid() = user_id);
create policy "Users manage own notes" on notes for all using (auth.uid() = user_id);
create policy "Users manage own members" on members for all using (auth.uid() = user_id);
