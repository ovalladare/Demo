import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../environments/environment';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
  title = 'Coco Colima - AWS Amplify Presentation';

  // Connection Form Data
  url: string = '';
  username: string = '';
  password: string = '';
  companyDb: string = '';

  // UI State
  loading: boolean = false;
  successMessage: string = '';
  errorMessage: string = '';

  // App State after connection
  isConnected: boolean = false;
  sessionId: string = '';
  sessionExpiry: Date | null = null;
  sessionTimeout: number = 0;

  // Articles Data
  items: any[] = [];
  loadingItems: boolean = false;
  itemsError: string = '';
  // modifications pending for SAP
  pendingUpdates: any[] = [];

  // Clients Data
  clients: any[] = [];
  loadingClients: boolean = false;
  clientsError: string = '';

  // Current view ('items' or 'clients')
  currentView: 'items' | 'clients' | '' = '';
  constructor(private http: HttpClient) { }

  ngOnInit() {
    this.url = environment.url || localStorage.getItem('amplifyDemo_url') || '';
    this.companyDb = environment.companyDb || localStorage.getItem('amplifyDemo_companyDb') || '';
    this.username = environment.username || localStorage.getItem('amplifyDemo_username') || '';
    this.password = environment.password || localStorage.getItem('amplifyDemo_password') || '';

    // Cargar sesión guardada
    const savedSessionId = localStorage.getItem('amplifyDemo_sessionId');
    const savedExpiry = localStorage.getItem('amplifyDemo_sessionExpiry');
    const savedTimeout = localStorage.getItem('amplifyDemo_sessionTimeout');

    if (savedSessionId && savedExpiry && savedTimeout) {
      this.sessionId = savedSessionId;
      this.sessionExpiry = new Date(savedExpiry);
      this.sessionTimeout = parseInt(savedTimeout, 10);

      if (this.isSessionValid()) {
        this.isConnected = true;
        this.successMessage = `Sesión restaurada. Expira en ${this.getTimeUntilExpiry()}`;
      } else {
        this.clearSession();
      }
    }
  }

  /** Verifica si la sesión actual es válida */
  private isSessionValid(): boolean {
    return this.sessionExpiry !== null && new Date() < this.sessionExpiry;
  }

  /** Obtiene el tiempo restante de la sesión en formato legible (minutos y segundos) */
  getTimeUntilExpiry(): string {
    if (!this.sessionExpiry) return '';
    const now = new Date();
    const diff = this.sessionExpiry.getTime() - now.getTime();
    if (diff <= 0) return 'expirada';

    const minutes = Math.floor(diff / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    return `${minutes}m ${seconds}s`;
  }

  /** URL base de SAP sin trailing slash ni /b1s/v2 */
  private getSapBase(): string {
    return this.url.trim().replace(/\/b1s\/(v1|v2)\/?$/i, '').replace(/\/$/, '');
  }

  /** Limpia la sesión guardada */
  private clearSession() {
    this.isConnected = false;
    this.sessionId = '';
    this.sessionExpiry = null;
    this.sessionTimeout = 0;
    localStorage.removeItem('amplifyDemo_sessionId');
    localStorage.removeItem('amplifyDemo_sessionExpiry');
    localStorage.removeItem('amplifyDemo_sessionTimeout');
  }

  onConnect() {
    this.successMessage = '';
    this.errorMessage = '';

    if (!this.url || !this.username || !this.password || !this.companyDb) {
      this.errorMessage = 'Por favor, complete todos los campos de conexión.';
      return;
    }

    this.loading = true;

    // Guardar credenciales para la próxima vez
    localStorage.setItem('amplifyDemo_url', this.url);
    localStorage.setItem('amplifyDemo_companyDb', this.companyDb);
    localStorage.setItem('amplifyDemo_username', this.username);
    localStorage.setItem('amplifyDemo_password', this.password);

    const loginUrl = `${this.getSapBase()}/b1s/v2/Login`;

    const body = {
      CompanyDB: this.companyDb,
      UserName: this.username,
      Password: this.password
    };

    const options: any = {
      headers: new HttpHeaders({ 'Content-Type': 'application/json' }),
      withCredentials: true,
      responseType: 'text'
    };

    this.http.post(loginUrl, body, options).subscribe({
      next: (res: any) => {
        let response = res;
        try { response = JSON.parse(res); } catch (e) { }

        this.loading = false;
        this.isConnected = true;
        this.sessionId = response?.SessionId || '';

        // Calcular expiración de sesión (SessionTimeout en minutos, default 30 min)
        this.sessionTimeout = response?.SessionTimeout || 30; // default 30 min
        this.sessionExpiry = new Date(Date.now() + this.sessionTimeout * 60 * 1000);

        // Guardar sesión en localStorage
        localStorage.setItem('amplifyDemo_sessionId', this.sessionId);
        localStorage.setItem('amplifyDemo_sessionExpiry', this.sessionExpiry.toISOString());
        localStorage.setItem('amplifyDemo_sessionTimeout', this.sessionTimeout.toString());

        this.successMessage = `¡Conexión exitosa! Sesión expira en ${this.getTimeUntilExpiry()}`;
      },
      error: (err) => {
        this.loading = false;
        console.error('Error:', err);

        if (err.status === 0) {
          this.errorMessage = `No se pudo conectar al servidor SAP. Verifica que la URL sea correcta y que el servidor esté accesible desde este navegador.`;
        } else if (err.error && typeof err.error === 'string' && err.error.includes('<html')) {
          this.errorMessage = 'El servidor devolvió una página HTML. Verifica que la URL apunte directamente al SAP ServiceLayer.';
        } else {
          let errMsg = err.message;
          try {
            const parsed = JSON.parse(err.error);
            errMsg = parsed.error?.message?.value || errMsg;
          } catch (e) {
            errMsg = err.error || errMsg;
          }
          this.errorMessage = `Error (${err.status}): ${(errMsg || '').substring(0, 300)}`;
        }
      }
    });
  }

  fetchItems() {
    if (!this.isSessionValid()) {
      this.clearSession();
      this.errorMessage = 'La sesión ha expirado. Por favor, inicia sesión nuevamente.';
      return;
    }
    this.currentView = 'items';
    this.loadingItems = true;
    this.itemsError = '';
    this.items = [];
    this.pendingUpdates = [];
    // clear clients
    this.clients = [];
    this.clientsError = '';

    // OnHand no es seleccionable vía $select en SAP OData — se excluye del $select
    // Sólo pedimos campos que SAP permite seleccionar directamente
    // Sin filtro para mostrar cualquier artículo (cambia según necesites)
    const itemsUrl = `${this.getSapBase()}/b1s/v2/Items?$top=20&$select=ItemCode,ItemName,DefaultWarehouse`;

    const options = {
      // withCredentials envía la cookie B1SESSION que SAP seteó al hacer login
      // En local: la cookie viaja a través del proxy → SAP ✅
      // En producción: la cookie acompaña la llamada directa a SAP ✅
      withCredentials: true,
      headers: new HttpHeaders({ 'Content-Type': 'application/json' })
    };

    this.http.get(itemsUrl, options).subscribe({
      next: (response: any) => {
        this.loadingItems = false;
        this.items = (response?.value || []).map((it: any) => ({
          ...it,
          selectedWarehouse: it.DefaultWarehouse || '',
          updated: false
        }));
      },
      error: (err) => {
        this.loadingItems = false;
        let msg = err.message;
        try { msg = JSON.parse(err.error)?.error?.message?.value || msg; } catch (e) { }
        this.itemsError = `Error al obtener artículos (${err.status}): ${msg}`;
      }
    });
  }

  updateWarehouse(item: any) {
    item.updated = true;
    item.editing = false;
    if (!this.pendingUpdates.find((p: any) => p.ItemCode === item.ItemCode)) {
      this.pendingUpdates.push(item);
    }
  }

  saveAllUpdates() {
    if (!this.isSessionValid()) { this.clearSession(); return; }
    const options = {
      withCredentials: true,
      headers: new HttpHeaders({ 'Content-Type': 'application/json' })
    };
    const calls = this.pendingUpdates.map((item: any) => {
      const url = `${this.getSapBase()}/b1s/v2/Items('${item.ItemCode}')`;
      return this.http.patch(url, { DefaultWarehouse: item.selectedWarehouse }, options);
    });

    let completed = 0;
    calls.forEach((call: any, idx: number) => {
      call.subscribe({
        next: () => {
          this.pendingUpdates[idx].saved = true;
          completed++;
          if (completed === calls.length) {
            this.successMessage = `${completed} artículo(s) actualizado(s) en SAP.`;
            this.pendingUpdates = [];
          }
        },
        error: (err: any) => {
          let msg = err.message;
          try { msg = JSON.parse(err.error)?.error?.message?.value || msg; } catch (e) { }
          this.itemsError = `Error al actualizar ${this.pendingUpdates[idx].ItemCode}: ${msg}`;
        }
      });
    });
  }

  logout() {
    const options = {
      withCredentials: true,
      headers: new HttpHeaders({ 'Content-Type': 'application/json' })
    };
    this.http.post(`${this.getSapBase()}/b1s/v2/Logout`, {}, options).subscribe({
      next: () => this.clearSession(),
      error: () => this.clearSession() // cerrar sesión localmente aunque falle SAP
    });
  }

  fetchClients() {
    if (!this.isSessionValid()) {
      this.clearSession();
      this.errorMessage = 'La sesión ha expirado. Por favor, inicia sesión nuevamente.';
      return;
    }
    this.currentView = 'clients';
    this.loadingClients = true;
    this.clientsError = '';
    this.clients = [];
    this.pendingUpdates = [];
    // clear items
    this.items = [];
    this.itemsError = '';

    // Solicita clientes (BusinessPartners) filtrando por código iniciando con "C"
    const clientsUrl = `${this.getSapBase()}/b1s/v2/BusinessPartners?$filter=startswith(CardCode,'C')&$top=20&$select=CardCode,CardName`;

    const options = {
      withCredentials: true,
      headers: new HttpHeaders({ 'Content-Type': 'application/json' })
    };

    this.http.get(clientsUrl, options).subscribe({
      next: (response: any) => {
        this.loadingClients = false;
        this.clients = response?.value || [];
      },
      error: (err) => {
        this.loadingClients = false;
        let msg = err.message;
        try { msg = JSON.parse(err.error)?.error?.message?.value || msg; } catch (e) { }
        this.clientsError = `Error al obtener clientes (${err.status}): ${msg}`;
      }
    });
  }
}
