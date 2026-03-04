import supabase from './src/config/supabase.js';
async function run() {
    const tablesToTry = ['eventos', 'incidencias', 'historial', 'logs', 'actividad', 'auditoria'];
    for(const t of tablesToTry) {
        const {data, error} = await supabase.from(t).select('*').limit(1);
        if(!error) console.log('Found table: ' + t);
        else console.log('Error for ' + t + ': ' + error.message);
    }
}
run();
