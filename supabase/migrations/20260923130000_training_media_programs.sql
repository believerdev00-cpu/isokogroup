-- Training Center: Videography and Photography programs.
-- 3 months at 100,000 RWF a month (300,000 tuition) plus a 10,000 registration fee.
-- Admins can change them under Training Center > Admin > Programs; an existing
-- program with the same code or slug is left as it is.
INSERT INTO training.programs (code, name, slug, category, description, duration_value, duration_unit, tuition_fee,
  registration_fee, course_content, requirements, max_students)
VALUES
  ('VD', 'Videography', 'videography', 'Creative',
   'Shoot and edit professional video for events, brands and social media, from planning a shoot to delivering the final cut.',
   3, 'months', 300000, 10000,
   E'Camera basics and settings\nFraming, composition and camera movement\nLighting and sound recording\nShooting events, interviews and ads\nVideo editing with Adobe Premiere Pro\nColour correction and delivery for social media\nPortfolio project',
   'Secondary school certificate. Basic computer skills.', 20),
  ('PH', 'Photography', 'photography', 'Creative',
   'Take and edit striking photos for portraits, events, products and brands, and learn to work with clients.',
   3, 'months', 300000, 10000,
   E'Camera basics: exposure, aperture, shutter speed and ISO\nComposition and light\nPortrait and studio photography\nEvent and product photography\nPhoto editing with Adobe Lightroom and Photoshop\nWorking with clients and pricing your work\nPortfolio project',
   'Secondary school certificate. Basic computer skills.', 20)
ON CONFLICT DO NOTHING;
