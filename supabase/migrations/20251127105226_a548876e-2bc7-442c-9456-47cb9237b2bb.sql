-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create enum types for roles and statuses
CREATE TYPE public.org_role AS ENUM ('ORG_ADMIN', 'PROJECT_MANAGER', 'WORKER');
CREATE TYPE public.project_role AS ENUM ('PROJECT_MANAGER', 'WORKER');
CREATE TYPE public.apartment_status AS ENUM ('NOT_STARTED', 'DOCUMENTING', 'COMPLETED');
CREATE TYPE public.item_type AS ENUM ('furniture', 'appliance', 'textile', 'small_item', 'other');
CREATE TYPE public.material_category AS ENUM ('glass', 'aluminum', 'wood', 'plastic', 'metal', 'textile', 'electrical', 'other');

-- Create profiles table (extends auth.users with additional data)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  org_role org_role NOT NULL DEFAULT 'WORKER',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create projects table
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  developer_name TEXT NOT NULL,
  start_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create user_projects join table
CREATE TABLE public.user_projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  project_role project_role NOT NULL DEFAULT 'WORKER',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, project_id)
);

-- Create apartments table
CREATE TABLE public.apartments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  building_number TEXT NOT NULL,
  apartment_number TEXT NOT NULL,
  status apartment_status NOT NULL DEFAULT 'NOT_STARTED',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, building_number, apartment_number)
);

-- Create items table
CREATE TABLE public.items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  apartment_id UUID NOT NULL REFERENCES public.apartments(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  location TEXT,
  intended_for_collection BOOLEAN NOT NULL DEFAULT TRUE,
  collected BOOLEAN NOT NULL DEFAULT FALSE,
  item_type item_type NOT NULL DEFAULT 'other',
  material_category material_category NOT NULL DEFAULT 'other',
  estimated_weight_kg NUMERIC(10, 2),
  image_url TEXT,
  created_by_user_id UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_user_projects_user_id ON public.user_projects(user_id);
CREATE INDEX idx_user_projects_project_id ON public.user_projects(project_id);
CREATE INDEX idx_apartments_project_id ON public.apartments(project_id);
CREATE INDEX idx_items_project_id ON public.items(project_id);
CREATE INDEX idx_items_apartment_id ON public.items(apartment_id);
CREATE INDEX idx_items_intended_for_collection ON public.items(intended_for_collection);
CREATE INDEX idx_items_collected ON public.items(collected);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_projects_updated_at BEFORE UPDATE ON public.user_projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_apartments_updated_at BEFORE UPDATE ON public.apartments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_items_updated_at BEFORE UPDATE ON public.items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to handle new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, name, org_role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', 'User'),
    'WORKER'
  );
  RETURN NEW;
END;
$$;

-- Create trigger for new user creation
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apartments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Users can view all profiles" ON public.profiles
  FOR SELECT USING (TRUE);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- RLS Policies for projects
CREATE POLICY "Users can view projects they're assigned to" ON public.projects
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_projects
      WHERE user_projects.project_id = projects.id
      AND user_projects.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.org_role = 'ORG_ADMIN'
    )
  );

CREATE POLICY "ORG_ADMIN can insert projects" ON public.projects
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.org_role = 'ORG_ADMIN'
    )
  );

CREATE POLICY "ORG_ADMIN and PROJECT_MANAGER can update projects" ON public.projects
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.org_role = 'ORG_ADMIN'
    )
    OR EXISTS (
      SELECT 1 FROM public.user_projects
      WHERE user_projects.project_id = projects.id
      AND user_projects.user_id = auth.uid()
      AND user_projects.project_role = 'PROJECT_MANAGER'
    )
  );

-- RLS Policies for user_projects
CREATE POLICY "Users can view their project assignments" ON public.user_projects
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.org_role = 'ORG_ADMIN'
    )
    OR EXISTS (
      SELECT 1 FROM public.user_projects up2
      WHERE up2.project_id = user_projects.project_id
      AND up2.user_id = auth.uid()
      AND up2.project_role = 'PROJECT_MANAGER'
    )
  );

CREATE POLICY "Managers can assign users to projects" ON public.user_projects
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.org_role = 'ORG_ADMIN'
    )
    OR EXISTS (
      SELECT 1 FROM public.user_projects
      WHERE user_projects.project_id = user_projects.project_id
      AND user_projects.user_id = auth.uid()
      AND user_projects.project_role = 'PROJECT_MANAGER'
    )
  );

CREATE POLICY "Managers can remove users from projects" ON public.user_projects
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.org_role = 'ORG_ADMIN'
    )
    OR EXISTS (
      SELECT 1 FROM public.user_projects up2
      WHERE up2.project_id = user_projects.project_id
      AND up2.user_id = auth.uid()
      AND up2.project_role = 'PROJECT_MANAGER'
    )
  );

-- RLS Policies for apartments
CREATE POLICY "Users can view apartments in their projects" ON public.apartments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_projects
      WHERE user_projects.project_id = apartments.project_id
      AND user_projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert apartments in their projects" ON public.apartments
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_projects
      WHERE user_projects.project_id = apartments.project_id
      AND user_projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update apartments in their projects" ON public.apartments
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.user_projects
      WHERE user_projects.project_id = apartments.project_id
      AND user_projects.user_id = auth.uid()
    )
  );

-- RLS Policies for items
CREATE POLICY "Users can view items in their projects" ON public.items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_projects
      WHERE user_projects.project_id = items.project_id
      AND user_projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert items in their projects" ON public.items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_projects
      WHERE user_projects.project_id = items.project_id
      AND user_projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update items in their projects" ON public.items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.user_projects
      WHERE user_projects.project_id = items.project_id
      AND user_projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete items in their projects" ON public.items
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.user_projects
      WHERE user_projects.project_id = items.project_id
      AND user_projects.user_id = auth.uid()
    )
  );