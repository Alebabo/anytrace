with updates(slug, twitter_url, linkedin_url) as (
  values
    ('atomico', 'https://twitter.com/nzennstrom', 'https://www.linkedin.com/company/atomico/'),
    ('index-ventures', 'https://twitter.com/indexventures', 'https://www.linkedin.com/company/index-ventures/'),
    ('earlybird-venture-capital', 'https://twitter.com/EarlybirdVC', 'https://www.linkedin.com/company/earlybird-venture-capital/'),
    ('hv-capital', 'https://twitter.com/hvcapital', 'https://www.linkedin.com/company/hvcapital/'),
    ('project-a-ventures', 'https://twitter.com/fheinemann', 'https://www.linkedin.com/company/project-a-vc/'),
    ('apx', null, 'https://www.linkedin.com/company/apxberlin/'),
    ('fly-ventures', 'https://twitter.com/flyvc', 'https://www.linkedin.com/company/fly-ventures/'),
    ('rheingau-founders', null, 'https://www.linkedin.com/company/rheingau-founders/'),
    ('high-tech-grunderfonds-htgf', 'https://twitter.com/htgf', 'https://www.linkedin.com/company/high-tech-gruenderfonds/'),
    ('picus-capital', null, 'https://www.linkedin.com/company/picus-capital/'),
    ('yellow-vc', null, 'https://www.linkedin.com/company/yellow.vc/')
)
update public.vc_sources vc
set
  twitter_url = updates.twitter_url,
  linkedin_url = updates.linkedin_url,
  x_handle = case
    when updates.twitter_url is null then null
    else regexp_replace(updates.twitter_url, '^https?://((www\.)?twitter\.com|x\.com)/', '')
  end
from updates
where vc.slug = updates.slug;
