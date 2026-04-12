import React from 'react';
import TopNavBar from '../components/TopNavBar';
import Footer from '../components/Footer';

const Section = ({ title, children }) => (
  <div className="mb-10">
    <h2 className="font-headline text-xl font-black text-white tracking-tight mb-4 pb-2 border-b border-[#353436]/50">
      {title}
    </h2>
    <div className="text-[#E5E2E3]/60 text-sm leading-relaxed space-y-3">{children}</div>
  </div>
);

const PrivacyScreen = () => (
  <div className="bg-[#0E0E0F] min-h-screen">
    <TopNavBar />
    <main className="pt-40 pb-24 px-12 max-w-3xl mx-auto">

      {/* Header */}
      <div className="mb-14">
        <p className="text-[9px] font-black uppercase tracking-[0.4em] text-primary mb-3">Legal</p>
        <h1 className="font-headline text-5xl font-black text-white tracking-tighter leading-tight mb-4">
          Política de Privacidad
        </h1>
        <p className="text-[#E5E2E3]/30 text-sm">Última actualización: abril de 2026</p>
      </div>

      <Section title="1. Información que recopilamos">
        <p>
          RedAutos recopila información que usted nos proporciona directamente al utilizar nuestra plataforma, como nombre, correo electrónico y datos de contacto cuando se registra o interactúa con una automotora.
        </p>
        <p>
          También recopilamos datos técnicos de uso como dirección IP, tipo de navegador, páginas visitadas y tiempo de sesión con el fin de mejorar la experiencia del usuario.
        </p>
      </Section>

      <Section title="2. Uso de la información">
        <p>Utilizamos la información recopilada para:</p>
        <ul className="list-disc list-inside space-y-1 pl-2">
          <li>Mostrar vehículos e información de automotoras relevantes.</li>
          <li>Facilitar el contacto entre compradores y vendedores.</li>
          <li>Mejorar el funcionamiento y rendimiento de la plataforma.</li>
          <li>Analizar tendencias de uso de forma anónima y agregada.</li>
        </ul>
        <p>No vendemos ni compartimos su información personal con terceros con fines comerciales.</p>
      </Section>

      <Section title="3. Geolocalización">
        <p>
          Si usted otorga permiso, RedAutos puede acceder a su ubicación geográfica para mostrar automotoras cercanas. Este permiso puede revocarse en cualquier momento desde la configuración de su navegador. No almacenamos su ubicación en nuestros servidores.
        </p>
      </Section>

      <Section title="4. Cookies y almacenamiento local">
        <p>
          Utilizamos el almacenamiento local del navegador para recordar sus preferencias de filtros y mejorar su experiencia de navegación. No utilizamos cookies de seguimiento de terceros.
        </p>
      </Section>

      <Section title="5. Seguridad de los datos">
        <p>
          Implementamos medidas técnicas razonables para proteger su información contra acceso no autorizado. Sin embargo, ningún sistema de transmisión de datos por internet es completamente seguro, por lo que no podemos garantizar una seguridad absoluta.
        </p>
      </Section>

      <Section title="6. Retención de datos">
        <p>
          Los datos de uso anónimos se conservan por un período máximo de 12 meses. Si solicita la eliminación de su cuenta o información personal, procesaremos su solicitud en un plazo de 30 días hábiles.
        </p>
      </Section>

      <Section title="7. Sus derechos">
        <p>Usted tiene derecho a:</p>
        <ul className="list-disc list-inside space-y-1 pl-2">
          <li>Acceder a los datos personales que tengamos sobre usted.</li>
          <li>Solicitar la corrección o eliminación de sus datos.</li>
          <li>Oponerse al procesamiento de sus datos en determinadas circunstancias.</li>
        </ul>
      </Section>

      <Section title="8. Cambios a esta política">
        <p>
          Nos reservamos el derecho de actualizar esta política de privacidad en cualquier momento. Le notificaremos sobre cambios significativos publicando la nueva versión en esta página con la fecha de actualización correspondiente.
        </p>
      </Section>

      <Section title="9. Contacto">
        <p>
          Si tiene preguntas, consultas o desea ejercer alguno de sus derechos sobre sus datos personales, puede contactarnos a través de nuestro equipo de soporte:
        </p>
        <div className="mt-4 p-5 bg-[#1C1B1F] border border-[#353436] rounded-sm flex items-center gap-4">
          <span className="material-symbols-outlined text-primary text-2xl">mail</span>
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-primary mb-1">Soporte técnico</p>
            <a
              href="mailto:kiwibyte.studio@gmail.com"
              className="text-[#E5E2E3] text-sm font-semibold hover:text-primary transition-colors"
            >
              kiwibyte.studio@gmail.com
            </a>
          </div>
        </div>
        <p className="mt-4 text-[#E5E2E3]/30 text-xs">
          RedAutos es una plataforma desarrollada por{' '}
          <a
            href="https://www.instagram.com/kiwibyte.uy/?hl=es"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            KiwiByte
          </a>
          . Respondemos consultas en un plazo de 2 a 5 días hábiles.
        </p>
      </Section>

    </main>
    <Footer />
  </div>
);

export default PrivacyScreen;
