CREATE UNIQUE INDEX quiz_family_version ON quizzes((data->>'familyId'),((data->>'version')::int));
