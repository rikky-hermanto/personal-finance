INSERT INTO category_rules (id, category, keyword, keyword_length, type, flow)
VALUES (1, 'Bill', 'Netflix', 7, 'Expense', NULL);
INSERT INTO category_rules (id, category, keyword, keyword_length, type, flow)
VALUES (2, 'Saving Interest', 'SAVING INTEREST', 15, 'Income', 'CR');
INSERT INTO category_rules (id, category, keyword, keyword_length, type, flow)
VALUES (3, 'Withdrawing', 'TARIKAN ATM', 11, 'Expense', 'DB');
INSERT INTO category_rules (id, category, keyword, keyword_length, type, flow)
VALUES (4, 'Salary', 'WORKX', 5, 'Income', NULL);
INSERT INTO category_rules (id, category, keyword, keyword_length, type, flow)
VALUES (5, 'Bill', 'PLN POWER SERVICE', 17, 'Expense', NULL);

SELECT setval(
    pg_get_serial_sequence('category_rules', 'id'),
    GREATEST(
        (SELECT MAX(id) FROM category_rules) + 1,
        nextval(pg_get_serial_sequence('category_rules', 'id'))),
    false);
