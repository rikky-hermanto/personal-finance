SELECT * 
    FROM transactions 
    WHERE description ilike '%%' and category ILIKE '%electricity%'  and  EXTRACT(MONTH FROM date) = 3;

    SELECT t.id, t.description, te.id AS embedding_id
FROM transactions t
LEFT JOIN transaction_embeddings te ON te.transaction_id = t.id
WHERE t.id = 24561;