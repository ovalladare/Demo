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

  // Articles Data
  items: any[] = [];
  loadingItems: boolean = false;
  itemsError: string = '';

  constructor(private http: HttpClient) { }

  ngOnInit() {
    this.url = environment.url || localStorage.getItem('amplifyDemo_url') || '';
    this.companyDb = environment.companyDb || localStorage.getItem('amplifyDemo_companyDb') || '';
    this.username = environment.username || localStorage.getItem('amplifyDemo_username') || '';
    this.password = environment.password || localStorage.getItem('amplifyDemo_password') || '';
  }

  /** URL base de SAP sin trailing slash ni /b1s/v2 */
  private getSapBase(): string {
    return this.url.trim().replace(/\/b1s\/(v1|v2)\/?$/i, '').replace(/\/$/, '');
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
        this.successMessage = `¡Conexión exitosa a ServiceLayer! SessionId: ${this.sessionId}`;
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
    this.loadingItems = true;
    this.itemsError = '';
    this.items = [];

    // OnHand no es seleccionable via $select en SAP OData — se excluye del $select
    // Sólo pedimos campos que SAP permite seleccionar directamente
    // Filtro por iniciales "BC": sintaxis OData correcta → startswith(ItemCode,'BC')
    const itemsUrl = `${this.getSapBase()}/b1s/v2/Items?$filter=startswith(ItemCode,'A')&$top=20&$select=ItemCode,ItemName,DefaultWarehouse`;

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
        this.items = response?.value || [];
      },
      error: (err) => {
        this.loadingItems = false;
        let msg = err.message;
        try { msg = JSON.parse(err.error)?.error?.message?.value || msg; } catch (e) { }
        this.itemsError = `Error al obtener artículos (${err.status}): ${msg}`;
      }
    });
  }
}
