import { HarnessLoader } from '@angular/cdk/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatButtonHarness } from '@angular/material/button/testing';
import { createComponentFactory, mockProvider, Spectator } from '@ngneat/spectator/jest';
import { MockComponent } from 'ng-mocks';
import { of } from 'rxjs';
import { MockApiService } from 'app/core/testing/classes/mock-api.service';
import { mockCall, mockApi } from 'app/core/testing/utils/mock-api.utils';
import { mockAuth } from 'app/core/testing/utils/mock-auth.utils';
import { DirectoryServiceState } from 'app/enums/directory-service-state.enum';
import { IdmapBackend, IdmapName } from 'app/enums/idmap.enum';
import { ActiveDirectoryConfig } from 'app/interfaces/active-directory-config.interface';
import { DirectoryServicesState } from 'app/interfaces/directory-services-state.interface';
import { Idmap } from 'app/interfaces/idmap.interface';
import { DialogService } from 'app/modules/dialog/dialog.service';
import { SearchInput1Component } from 'app/modules/forms/search-input1/search-input1.component';
import { IxIconHarness } from 'app/modules/ix-icon/ix-icon.harness';
import { IxTableHarness } from 'app/modules/ix-table/components/ix-table/ix-table.harness';
import { PageHeaderComponent } from 'app/modules/page-header/page-title-header/page-header.component';
import { SlideIn } from 'app/modules/slide-ins/slide-in';
import { ApiService } from 'app/modules/websocket/api.service';
import { IdmapFormComponent } from 'app/pages/directory-service/components/idmap-form/idmap-form.component';
import { IdmapListComponent } from 'app/pages/directory-service/components/idmap-list/idmap-list.component';

describe('IdmapListComponent', () => {
  let spectator: Spectator<IdmapListComponent>;
  let loader: HarnessLoader;
  let table: IxTableHarness;
  let api: ApiService;

  const idmapRecords = [
    {
      id: 5,
      name: IdmapName.DsTypeDefaultDomain,
      dns_domain_name: null,
      range_low: 90000001,
      range_high: 100000000,
      idmap_backend: IdmapBackend.Ldap,
      options: {},
      certificate: null,
    },
    {
      id: 5,
      name: 'test',
      dns_domain_name: 'ad.ixsystems.net',
      range_low: 1000,
      range_high: 1000000,
      idmap_backend: IdmapBackend.Rid,
      options: {},
      certificate: {
        id: 1,
        cert_name: 'my certificate',
      },
    },
  ] as Idmap[];

  const createComponent = createComponentFactory({
    component: IdmapListComponent,
    imports: [
      MockComponent(PageHeaderComponent),
      SearchInput1Component,
    ],
    providers: [
      mockApi([
        mockCall('idmap.query', idmapRecords),
        mockCall('idmap.delete'),
        mockCall('directoryservices.get_state', () => ({
          activedirectory: DirectoryServiceState.Disabled,
          ldap: DirectoryServiceState.Disabled,
        })),
        mockCall('activedirectory.config', {
          enable: true,
        } as ActiveDirectoryConfig),
      ]),
      mockProvider(DialogService, {
        confirm: jest.fn(() => of(true)),
      }),
      mockProvider(SlideIn, {
        open: jest.fn(() => of()),
      }),
      mockAuth(),
    ],
  });

  beforeEach(async () => {
    spectator = createComponent();
    loader = TestbedHarnessEnvironment.loader(spectator.fixture);
    table = await loader.getHarness(IxTableHarness);
    api = spectator.inject(ApiService);
  });

  describe('loading', () => {
    it('checks directory services state before loading records', () => {
      expect(api.call).toHaveBeenCalledWith('directoryservices.get_state');
    });

    it('loads all idmap records when directory services are disabled', () => {
      expect(api.call).toHaveBeenCalledWith('idmap.query');
    });

    it('loads LDAP entries when LDAP is on', () => {
      const mockedApi = spectator.inject(MockApiService);
      mockedApi.mockCall('directoryservices.get_state', {
        activedirectory: DirectoryServiceState.Disabled,
        ldap: DirectoryServiceState.Healthy,
      } as DirectoryServicesState);

      spectator.component.ngOnInit();
      expect(api.call).toHaveBeenCalledWith('idmap.query', [[['name', '=', IdmapName.DsTypeLdap]]]);
    });

    it('loads records other than LDAP when Active Directory is on', () => {
      const mockedApi = spectator.inject(MockApiService);
      mockedApi.mockCall('directoryservices.get_state', {
        activedirectory: DirectoryServiceState.Joining,
        ldap: DirectoryServiceState.Disabled,
      } as DirectoryServicesState);

      spectator.component.ngOnInit();
      expect(api.call).toHaveBeenCalledWith('idmap.query', [[['name', '!=', IdmapName.DsTypeLdap]]]);
    });
  });

  it('shows table with idmap records', async () => {
    const cells = await table.getCellTexts();
    expect(cells).toEqual([
      [
        'Name',
        'Backend',
        'DNS Domain Name',
        'Range Low',
        'Range High',
        'Certificate',
        '',
      ],
      [
        'SMB - Primary Domain',
        'LDAP',
        '',
        '90000001',
        '100000000',
        '',
        '',
      ],
      [
        'test',
        'RID',
        'ad.ixsystems.net',
        '1000',
        '1000000',
        'my certificate',
        '',
      ],
    ]);
  });

  it('opens edit form when edit icon is pressed', async () => {
    const editButton = await table.getHarnessInCell(IxIconHarness.with({ name: 'edit' }), 1, 6);
    await editButton.click();

    expect(spectator.inject(SlideIn).open).toHaveBeenCalledWith(IdmapFormComponent, {
      data: idmapRecords[0],
    });
  });

  it('does not show delete icon for required idmap domains', async () => {
    const deleteButton = await table.getAllHarnessesInCell(IxIconHarness.with({ name: 'mdi-delete' }), 1, 6);
    expect(deleteButton).toHaveLength(0);
  });

  it('deletes a record with confirmation when delete is pressed', async () => {
    const deleteButton = await table.getHarnessInCell(IxIconHarness.with({ name: 'mdi-delete' }), 2, 6);
    await deleteButton.click();

    expect(spectator.inject(DialogService).confirm).toHaveBeenCalled();
    expect(api.call).toHaveBeenCalledWith('idmap.delete', [5]);
  });

  it('opens form when "Add" button is pressed', async () => {
    spectator.setInput('inCard', false);

    const addButton = await loader.getHarness(MatButtonHarness.with({ text: 'Add' }));
    await addButton.click();

    expect(spectator.inject(SlideIn).open).toHaveBeenCalledWith(IdmapFormComponent);
  });
});
