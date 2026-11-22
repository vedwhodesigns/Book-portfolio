-- Video Lab: videos and channels sent for analysis from the "postroom.mjs grab" command. Safe to re-run.
alter table postroom.research_projects drop constraint if exists research_projects_source_check;
alter table postroom.research_projects add constraint research_projects_source_check check (source in ('ig-research', 'youtube', 'instagram-api', 'video-lab'));
