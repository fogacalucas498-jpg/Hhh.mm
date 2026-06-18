import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import "./landing.css";

const Logo = () => (
  <div className="nav-logo">
    <img src="/logo.jpg" alt="bot 777 🎰" />
    <span className="nav-logo-text">bot 777 🎰</span>
  </div>
);

const MARQUEE_ITEMS = [
  "🤖 Múltiplos Agentes","⚡ IA Powered","☁️ 100% Cloud","📊 Relatórios em Tempo Real",
  "🔒 Segurança LGPD","📁 Base de Conhecimento","🎙️ Transcreve Áudios","📱 Múltiplos Números",
  "⏰ Economize Tempo","👥 Controle seus Leads","🔧 Fácil Configuração","💜 100% Gratuito",
];

export default function LandingPage() {
  const [, navigate] = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activeTab, setActiveTab] = useState("construa");
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const goTo = (href: string) => {
    setNavOpen(false);
    if (href.startsWith("#")) {
      const el = document.querySelector(href);
      if (el) el.scrollIntoView({ behavior: "smooth" });
    } else {
      navigate(href);
    }
  };

  const TABS = [
    {
      id: "construa", label: "🔨 Construa",
      title: "Faça Uma Vez e Observe",
      text: "Crie e treine um agente de I.A com o conhecimento do seu produto, defina as regras de comportamento e conecte ao seu WhatsApp. Depois, é só acompanhar os resultados.",
      items: ["Editor visual de agentes","Upload de PDFs e documentos","Base de conhecimento ilimitada","Personalidade e tom configuráveis"],
      visual: (
        <div className="visual-card">
          <div className="agent-preview">
            <div className="agent-avatar">🤖</div>
            <div><div className="agent-name">Agente Vendas Pro</div><div className="agent-model">GPT-4o · Ativo</div></div>
            <div className="agent-status-dot" />
          </div>
          <div className="training-items">
            <div className="training-item">📄 Manual do Produto.pdf</div>
            <div className="training-item">🌐 www.meusite.com.br</div>
            <div className="training-item">❓ Perguntas Frequentes</div>
          </div>
        </div>
      ),
    },
    {
      id: "resolva", label: "✅ Resolva",
      title: "Resolva Dúvidas em Segundos",
      text: "Seu agente responde perguntas frequentes, preços, prazos e detalhes do produto automaticamente — 24h por dia, 7 dias por semana, sem intervenção humana.",
      items: ["Respostas instantâneas 24/7","Entendimento de contexto avançado","Suporte a múltiplos idiomas","Histórico de conversas completo"],
      visual: (
        <div className="visual-card">
          <div className="mockup-chat" style={{ gap: 10 }}>
            <div className="chat-msg in">Qual o prazo de entrega?</div>
            <div className="chat-msg out">Entregamos em até 5 dias úteis para todo o Brasil! 🚚</div>
            <div className="chat-msg in">Tem parcelamento?</div>
            <div className="chat-msg out">Sim! Parcelamos em até 12x sem juros no cartão 💳</div>
          </div>
        </div>
      ),
    },
    {
      id: "otimize", label: "⚡ Otimize",
      title: "Métricas que Geram Resultado",
      text: "Acompanhe em tempo real o desempenho dos seus agentes, volume de atendimentos e leads capturados — tudo em dashboards claros e acionáveis.",
      items: ["Dashboard em tempo real","Taxa de resolução automática","Leads capturados por agente","Relatórios exportáveis"],
      visual: (
        <div className="visual-card">
          {[["Mensagens Hoje","1.247","↑ 23%"],["Taxa de Resolução","98.2%","↑ 4%"],["Leads Capturados","89","↑ 12%"]].map(([label, val, delta]) => (
            <div key={label} className="mockup-stat" style={{ padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
              <span>{label}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <strong style={{ color: "#fff", fontWeight: 700 }}>{val}</strong>
                <span style={{ fontSize: "0.75rem", color: "#a78bfa" }}>{delta}</span>
              </span>
            </div>
          ))}
        </div>
      ),
    },
    {
      id: "transfira", label: "🤝 Transfira",
      title: "Humano Quando Precisar",
      text: "Quando o cliente precisar de atendimento especializado, o agente transfere automaticamente com todo o contexto da conversa — sem o cliente precisar repetir nada.",
      items: ["Transferência com contexto completo","Notificação instantânea ao atendente","Retomada automática pelo bot","Histórico unificado da conversa"],
      visual: (
        <div className="visual-card">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="chat-msg in" style={{ maxWidth: "100%" }}>Preciso falar com um atendente</div>
            <div className="chat-msg out" style={{ maxWidth: "100%" }}>Claro! Transferindo você agora... 🤝</div>
            <div style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.3)", borderRadius: 8, padding: "10px 14px", fontSize: "0.82rem", color: "#a78bfa" }}>
              ✓ Atendente Ana conectada — contexto enviado automaticamente
            </div>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="lp">
      {/* NAVBAR */}
      <nav className={`navbar${scrolled ? " scrolled" : ""}`} ref={navRef} style={{ position: "relative" }}>
        <div className="nav-container">
          <a href="#home" onClick={e => { e.preventDefault(); goTo("#home"); }}>
            <Logo />
          </a>
          <ul className={`nav-links${navOpen ? " open" : ""}`}>
            {[["#features","Funcionalidades"],["#como-funciona","Como Funciona"],["#faq","FAQ"]].map(([h,l]) => (
              <li key={h}><a href={h} onClick={e => { e.preventDefault(); goTo(h); }}>{l}</a></li>
            ))}
          </ul>
          <div className="nav-actions">
            <button className="btn-ghost" onClick={() => navigate("/login")}>Acessar</button>
            <button className="btn-primary" onClick={() => navigate("/login")}>Começar Grátis</button>
          </div>
          <button className="nav-mobile-toggle" onClick={() => setNavOpen(v => !v)}>☰</button>
        </div>
      </nav>

      {/* HERO */}
      <section className="hero" id="home">
        <div className="hero-bg" />
        <div className="hero-container">
          <div className="hero-badge">
            <span className="badge-dot" />
            Plataforma de Atendimento com I.A — 100% Gratuita
          </div>
          <h1 className="hero-title">
            Transforme seu WhatsApp<br />
            com <span className="text-gradient">Inteligência Artificial</span>
          </h1>
          <p className="hero-subtitle">
            Com o <strong>bot 777 🎰</strong>, crie agentes de I.A treinados com o conhecimento do seu negócio
            e atenda clientes no WhatsApp de forma automática, natural e eficiente. Sem código, sem complicação. <strong style={{ color: "#a78bfa" }}>100% grátis.</strong>
          </p>
          <div className="hero-actions">
            <button className="btn-primary btn-large" onClick={() => navigate("/login")}>
              Cadastre-se Grátis
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </button>
            <span className="free-badge">💜 Sem cartão de crédito · Acesso imediato</span>
          </div>

          {/* Mockup */}
          <div className="hero-mockup">
            <div className="mockup-topbar">
              <span className="dot red" /><span className="dot yellow" /><span className="dot green" />
              <span className="mockup-url">app.bot.io/dashboard</span>
            </div>
            <div className="mockup-screen">
              <div className="mockup-sidebar">
                {[["🤖 Agentes",true],["📱 Dispositivos",false],["💬 Conversas",false],["📊 Relatórios",false]].map(([label, active]) => (
                  <div key={String(label)} className={`mockup-nav-item${active ? " active" : ""}`}>{String(label)}</div>
                ))}
              </div>
              <div className="mockup-content">
                <div className="mockup-card">
                  <div className="mockup-card-header">
                    <div className="mockup-avatar purple" />
                    <div><div className="mockup-name">Agente Vendas</div><div className="mockup-status">● Online</div></div>
                  </div>
                  <div className="mockup-stat"><span>Mensagens hoje</span><strong>1.247</strong></div>
                  <div className="mockup-stat"><span>Taxa de resposta</span><strong>98.2%</strong></div>
                </div>
                <div className="mockup-chat">
                  <div className="chat-msg in">Olá! Queria saber mais sobre o produto 😊</div>
                  <div className="chat-msg out">Claro! Fico feliz em ajudar. Qual é sua principal dúvida?</div>
                  <div className="chat-msg in">Qual o prazo de entrega?</div>
                  <div className="chat-typing"><span /><span /><span /></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* MARQUEE */}
      <section className="marquee-section">
        <div className="marquee-track">
          <div className="marquee-inner">
            {[...MARQUEE_ITEMS, ...MARQUEE_ITEMS].map((item, i) => (
              <span key={i}>{item}</span>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="features" id="features">
        <div className="container">
          <div className="section-tag">Perfeita Para Qualquer Negócio</div>
          <h2>A Plataforma completa<br />para agentes de I.A</h2>
          <p className="section-subtitle">O bot 777 🎰 é uma plataforma focada na construção de agentes de I.A que resolvem as dores do seu cliente e aumentam seus lucros.</p>
          <div className="features-grid">
            <div className="feature-card feature-card--highlight">
              <div className="feature-icon">🚀</div>
              <h3>Impulsione Satisfação e Fidelidade</h3>
              <p>Com o nosso construtor de agentes, sua única preocupação é fornecer a base de conhecimento e conectar seu WhatsApp. A I.A faz o resto.</p>
              <div className="feature-preview">
                <div className="preview-line" /><div className="preview-line short" /><div className="preview-line medium" />
              </div>
            </div>
            {[
              ["🎛️","Controle que Reflete Excelência","Administre o conteúdo ensinado ao seu agente com o nosso editor poderoso e extremamente simples de usar."],
              ["📚","Embarque Conhecimento de Forma Simples","PDFs, sites, instruções ou perguntas frequentes — diversas formas de alimentar o conhecimento da sua empresa para o agente."],
              ["🎙️","Entende e Responde em Áudio","Seus clientes mandam áudio? O bot 777 🎰 transcreve, entende e pode responder também em áudio com voz natural."],
              ["📊","Dashboards e Relatórios em Tempo Real","Acompanhe conversas, leads capturados e desempenho dos agentes com métricas claras e acionáveis."],
              ["🔁","Transferência para Humano","Quando o cliente precisar de um atendente humano, o agente transfere automaticamente com todo o contexto da conversa."],
            ].map(([icon, title, desc]) => (
              <div className="feature-card" key={String(title)}>
                <div className="feature-icon">{icon}</div>
                <h3>{title}</h3>
                <p>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="how-it-works" id="como-funciona">
        <div className="container">
          <div className="section-tag">Simples do início ao fim</div>
          <h2>Como o bot 777 🎰 Funciona</h2>
          <p className="section-subtitle">Três passos para ter seu agente de I.A atendendo clientes no WhatsApp.</p>
          <div className="steps-grid">
            {[
              ["01","🤖","Treine seu Agente","Crie um agente e treine com instruções, documentos, perguntas frequentes e mais. 100% personalizado para o seu negócio."],
              ["02","📱","Conecte o WhatsApp","Escaneie o QR Code para conectar seu número. Sem instalar nada no celular, 100% na nuvem."],
              ["03","📈","Veja os Resultados","Seu agente começa a atender. Monitore conversas, intervenha quando quiser e escale sem limite."],
            ].map(([num, icon, title, desc]) => (
              <div className="step-card" key={num}>
                <div className="step-number">{num}</div>
                <div className="step-icon-wrap" style={{ fontSize: "2.2rem" }}>{icon}</div>
                <h3>{title}</h3>
                <p>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* BENEFITS */}
      <section className="benefits" id="beneficios">
        <div className="container">
          <div className="section-tag">Benefícios</div>
          <h2>Desbloqueie o Potencial Total</h2>
          <p className="section-subtitle">Viva a experiência completa que um agente de I.A super treinado pode oferecer para sua equipe e clientes.</p>
          <div className="benefits-tabs">
            {TABS.map(t => (
              <button key={t.id} className={`tab-btn${activeTab === t.id ? " active" : ""}`} onClick={() => setActiveTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="benefits-content">
            {TABS.map(t => (
              <div key={t.id} className={`tab-panel${activeTab === t.id ? " active" : ""}`}>
                <div className="benefit-layout">
                  <div className="benefit-text">
                    <h3>{t.title}</h3>
                    <p>{t.text}</p>
                    <ul className="benefit-list">
                      {t.items.map(item => <li key={item}>{item}</li>)}
                    </ul>
                  </div>
                  <div className="benefit-visual">{t.visual}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FREE — no lugar do pricing */}
      <section className="free-section" id="planos">
        <div className="container">
          <div className="section-tag" style={{ textAlign: "center", display: "block", margin: "0 auto 16px" }}>
            Sem mensalidade, sem surpresas
          </div>
          <h2 style={{ textAlign: "center" }}>Tudo Grátis, Para Sempre</h2>
          <p className="section-subtitle" style={{ textAlign: "center", margin: "12px auto 0" }}>
            O bot 777 🎰 é 100% gratuito. Sem planos, sem cartão de crédito, sem pegadinhas. Crie sua conta e comece agora.
          </p>
          <div className="free-grid">
            {[
              ["♾️","Agentes Ilimitados","Crie quantos agentes precisar, sem restrição de quantidade ou funcionalidades."],
              ["💬","Mensagens Ilimitadas","Seu bot atende sem limite de mensagens mensais. Atenda à vontade."],
              ["📱","Dispositivos WhatsApp","Conecte seus números de WhatsApp e gerencie tudo em um só lugar."],
            ].map(([icon, title, desc]) => (
              <div className="free-card" key={String(title)}>
                <div className="free-card-icon">{icon}</div>
                <h3>{title}</h3>
                <p>{desc}</p>
              </div>
            ))}
          </div>
          <div style={{ textAlign: "center", marginTop: 48 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 12, background: "linear-gradient(135deg, rgba(139,92,246,0.2), rgba(196,132,252,0.12))", border: "1px solid rgba(139,92,246,0.4)", borderRadius: 16, padding: "20px 40px" }}>
              <span style={{ fontSize: "2rem" }}>💜</span>
              <div style={{ textAlign: "left" }}>
                <div style={{ fontWeight: 800, fontSize: "1.3rem", color: "#fff" }}>100% Gratuito</div>
                <div style={{ fontSize: "0.88rem", color: "#a1a1aa" }}>Sem cartão de crédito · Acesso completo · Para sempre</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="faq" id="faq">
        <div className="faq-container">
          <div style={{ textAlign: "center" }}>
            <div className="section-tag">Sem deixar dúvidas</div>
            <h2>Perguntas Frequentes</h2>
          </div>
          <div className="faq-list">
            {[
              ["Como é feita a segurança dos dados?","Seus dados e chaves de API jamais serão utilizados para treinar novos modelos. Seguimos rigorosamente a LGPD. Todo o tráfego é criptografado com TLS/HTTPS."],
              ["É possível o robô executar ações?","Sim! Via webhooks, o bot 777 🎰 pode acionar sistemas externos, atualizar CRMs, enviar notificações e muito mais sempre que uma condição for atingida na conversa."],
              ["Com quais documentos posso treinar meu agente?","PDFs, textos, URLs de sites, perguntas e respostas manuais, e em breve integração com Notion e Google Docs."],
              ["Meu WhatsApp pode ser banido?","O bot 777 🎰 usa comportamento humanizado com delays variáveis para simular digitação real. Ainda assim, recomendamos usar números dedicados ao bot, não seu número pessoal."],
              ["O bot 777 🎰 é realmente gratuito?","Sim, 100% gratuito. Sem planos pagos, sem cartão de crédito. Basta criar sua conta e começar a usar agora mesmo."],
            ].map(([q, a]) => (
              <details className="faq-item" key={q}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="cta-final">
        <div className="container">
          <div className="cta-card">
            <div className="cta-glow" />
            <div className="section-tag">Para Negócios que Querem Crescer</div>
            <h2>Transforme seu WhatsApp com I.A!</h2>
            <p>Faça parte dos negócios que estão transformando o atendimento no WhatsApp com inteligência artificial. Comece agora, é 100% gratuito.</p>
            <button className="btn-primary btn-large" onClick={() => navigate("/login")}>Começar Grátis Agora</button>
            <p className="cta-note">💜 Sem cartão de crédito · 100% gratuito · Acesso imediato</p>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="footer">
        <div className="container">
          <div className="footer-top">
            <div className="footer-brand">
              <div className="footer-logo">
                <img src="/logo.jpg" alt="bot 777 🎰" />
                <span className="footer-logo-text">bot 777 🎰</span>
              </div>
              <p>Atendimento inteligente no WhatsApp com I.A. Simples, eficiente e 100% gratuito.</p>
            </div>
            <div className="footer-links">
              <div className="footer-col">
                <h4>Produto</h4>
                <a href="#features" onClick={e => { e.preventDefault(); goTo("#features"); }}>Funcionalidades</a>
                <a href="#como-funciona" onClick={e => { e.preventDefault(); goTo("#como-funciona"); }}>Como Funciona</a>
                <a href="/login" onClick={e => { e.preventDefault(); navigate("/login"); }}>Acessar</a>
              </div>
              <div className="footer-col">
                <h4>Legal</h4>
                <a href="#">Termos de Uso</a>
                <a href="#">Privacidade</a>
              </div>
            </div>
          </div>
          <div className="footer-bottom">
            <p>bot 777 🎰 © 2026 · Todos os Direitos Reservados.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
