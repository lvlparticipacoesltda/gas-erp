/** Texto da política de privacidade do app THLGDP Entregador (Play Store). */
export const PRIVACY_POLICY_ENTREGADOR = {
  title: 'Política de Privacidade — App THLGDP Entregador',
  updatedAt: '09/07/2026',
  /** Nome exato do app na Google Play / App Store. */
  appName: 'THLGDP Entregador',
  /** Nome exato da conta desenvolvedor na Google Play Console. */
  playDeveloper: 'LVL SERVICOS E PARTICIPACOES LTDA',
  androidPackage: 'com.gaserp.entregador',
  iosBundleId: 'com.gaserp.entregador',
  controller: 'THL Gás do Povo — Rede Gás Litoral',
  contactEmail: 'contato@thlgasdopovo.com.br',
  website: 'https://thlgasdopovo.com.br',
  sections: [
    {
      heading: '1. Introdução',
      paragraphs: [
        'Esta Política de Privacidade aplica-se ao aplicativo móvel THLGDP Entregador (o "App"), publicado na Google Play sob o pacote Android com.gaserp.entregador pela conta desenvolvedor LVL SERVICOS E PARTICIPACOES LTDA.',
        'O App é operado em benefício da distribuidora à qual o entregador está vinculado, em parceria com a rede THL Gás do Povo — Rede Gás Litoral. Esta política descreve como o App coleta, usa e protege os dados dos entregadores que o utilizam.',
        'O App é uma ferramenta de uso profissional, disponibilizada pelas distribuidoras de GLP (gás) às suas equipes de entrega. Os dados são tratados para fins de operação logística, gestão de entregas e comunicação com a equipe.',
      ],
    },
    {
      heading: '2. Quais dados coletamos',
      list: [
        { label: 'Nome, e-mail e telefone', detail: 'Identificação e autenticação do entregador — no login e no cadastro pela distribuidora.' },
        { label: 'Localização precisa (GPS)', detail: 'Exibir posição no mapa da loja e acompanhar entregas em rota — enquanto o entregador está disponível e/ou com rota ativa (ver seção 4).' },
        { label: 'Dados das entregas', detail: 'Cliente, endereço, itens e valores — para realizar e registrar as entregas atribuídas.' },
        { label: 'Dados de vendas pelo app', detail: 'Informações de pedidos registrados pelo entregador (produto, quantidade, formas de pagamento) — quando o recurso estiver habilitado pela loja.' },
        { label: 'Token de notificação push', detail: 'Alertar sobre novas entregas, lembretes e cancelamentos — após conceder permissão de notificações.' },
        { label: 'Nível de bateria (opcional)', detail: 'Auxiliar a loja a entender disponibilidade do dispositivo durante o expediente.' },
      ],
    },
    {
      heading: '3. Notificações push',
      paragraphs: [
        'O App pode enviar notificações para avisar o entregador sobre novas entregas atribuídas, lembretes de aceite ou cancelamentos. O token é registrado no servidor da distribuidora após o login e removido no logout.',
        'As notificações não são usadas para publicidade ou marketing de terceiros.',
      ],
    },
    {
      heading: '4. Localização e mapa',
      paragraphs: [
        'O App utiliza a localização do dispositivo nas seguintes situações:',
      ],
      list: [
        { label: 'Presença no mapa', detail: 'Quando o entregador está marcado como disponível pela loja, a posição pode ser atualizada periodicamente para exibição no mapa operacional — inclusive com o app em primeiro plano.' },
        { label: 'Rota de entrega ativa', detail: 'Ao iniciar uma rota, a localização é coletada em primeiro e segundo plano (com o app minimizado ou a tela bloqueada), com notificação persistente no Android, até a conclusão da entrega ou logout.' },
        { label: 'Sem coleta indevida', detail: 'A localização não é coletada quando o entregador está indisponível, sem rota ativa e sem permissão concedida.' },
      ],
      extra: 'Antes de solicitar a permissão de localização em segundo plano, o App exibe uma divulgação destacada explicando o uso dos dados. A coleta só ocorre após o consentimento explícito do entregador e a concessão da permissão do sistema operacional.',
    },
    {
      heading: '5. Como usamos e compartilhamos',
      paragraphs: [
        'Os dados são enviados ao servidor da distribuidora à qual o entregador está vinculado e ficam visíveis apenas para a equipe autorizada daquela empresa, para fins de operação logística.',
        'Não vendemos dados pessoais nem os utilizamos para publicidade. Cada organização (distribuidora) tem seus dados isolados das demais no sistema.',
        'A infraestrutura de hospedagem e processamento pode utilizar provedores de nuvem (por exemplo, servidores no Brasil ou no exterior), sempre com comunicação criptografada (HTTPS).',
      ],
    },
    {
      heading: '6. Retenção',
      paragraphs: [
        'Os dados são mantidos pelo período necessário à operação, cumprimento de obrigações legais e auditoria das entregas. Pontos de trajeto e registros operacionais podem ser arquivados conforme a política interna da distribuidora.',
      ],
    },
    {
      heading: '7. Direitos do titular e exclusão de conta',
      paragraphs: [
        'O entregador pode solicitar acesso, correção ou exclusão de seus dados pessoais. Para excluir a conta e os dados associados:',
      ],
      list: [
        { label: 'Por e-mail', detail: 'Envie solicitação para contato@thlgasdopovo.com.br informando nome, e-mail cadastrado e a distribuidora à qual está vinculado.' },
        { label: 'Pela distribuidora', detail: 'Solicite ao gestor da sua unidade, que pode desativar o usuário e o vínculo de entregador no painel administrativo.' },
      ],
      extra: 'Instruções detalhadas: https://thlgasdopovo.com.br/exclusao-conta-entregador',
    },
    {
      heading: '8. Segurança',
      paragraphs: [
        'As credenciais de acesso são armazenadas de forma segura no dispositivo (armazenamento cifrado do sistema operacional). A comunicação com o servidor ocorre por HTTPS.',
      ],
    },
    {
      heading: '9. Crianças',
      paragraphs: [
        'O App é destinado a uso profissional por adultos (entregadores). Não é direcionado a menores de 18 anos.',
      ],
    },
    {
      heading: '10. Alterações',
      paragraphs: [
        'Esta política pode ser atualizada periodicamente. A data no topo da página indica a última revisão. Alterações relevantes podem ser comunicadas pela distribuidora ou por aviso no App.',
      ],
    },
  ],
} as const;

export const ACCOUNT_DELETION_ENTREGADOR = {
  title: 'Exclusão de conta — App THLGDP Entregador',
  updatedAt: '09/07/2026',
  appName: 'THLGDP Entregador',
  contactEmail: 'contato@thlgasdopovo.com.br',
  steps: [
    'Envie um e-mail para contato@thlgasdopovo.com.br com o assunto "Exclusão de conta — THLGDP Entregador".',
    'Informe seu nome completo, o e-mail cadastrado no App e a distribuidora/unidade à qual está vinculado.',
    'Opcionalmente, descreva se deseja exclusão apenas do acesso ao App ou de todos os registros operacionais associados.',
    'Nossa equipe ou o gestor da sua distribuidora confirmará a solicitação em até 15 dias úteis.',
    'Alternativamente, peça ao gestor da sua unidade para desativar seu usuário no painel Gas ERP — isso impede novos logins e remove o vínculo ativo de entregador.',
  ],
  note: 'Alguns registros de entregas já realizadas podem ser mantidos de forma anonimizada ou agregada quando houver obrigação legal ou necessidade de auditoria fiscal/operacional, conforme a legislação aplicável.',
} as const;
