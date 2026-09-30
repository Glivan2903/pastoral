-- Autocadastro: quem se cadastra entra como Usuário (cargo "membro"); o administrador ajusta depois.
INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES ('cadastro_aberto', '1');

-- @down
DELETE FROM configuracoes WHERE chave = 'cadastro_aberto';
