SELECT * 
    FROM transactions 
    WHERE description ilike '%deposit%' and category ILIKE '%stock%'--and 