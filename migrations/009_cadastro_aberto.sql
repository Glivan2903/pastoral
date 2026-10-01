-- Autocadastro: quem se cadastra entra como Usuário (cargo "membro"); o administrador ajusta depois.
INSERT INTO configuracoes (chave, valor) VALUES ('cadastro_aberto', '1') ON CONFLICT DO NOTHING;

-- @down
DELETE FROM configuracoes WHERE chave = 'cadastro_aberto';
