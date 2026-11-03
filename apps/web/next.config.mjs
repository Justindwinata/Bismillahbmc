import process from 'node:process';
const apiPort=Number(process.env.API_PORT??4000);if(!Number.isInteger(apiPort)||apiPort<1024||apiPort>65535)throw new Error('INVALID_LOCAL_API_PORT');
const distDir=process.env.NEXT_DIST_DIR??'.next';if(!/^\.next(?:-[a-z0-9-]+)?$/.test(distDir))throw new Error('INVALID_BUILD_DIRECTORY');
const config={distDir,
  poweredByHeader:false,
  async rewrites(){return [{source:'/api/v1/:path*',destination:'http://127.0.0.1:'+apiPort+'/api/v1/:path*'}];},
  async headers(){return [{source:'/:path*',headers:[
    {key:'X-Content-Type-Options',value:'nosniff'},
    {key:'Referrer-Policy',value:'no-referrer'},
    {key:'X-Frame-Options',value:'DENY'},
    {key:'Content-Security-Policy',value:"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"}
  ]}];}
};
export default config;
